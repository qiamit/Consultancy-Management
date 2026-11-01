// Runs QE Assistant scheduled tasks (assistant_tasks) in the functions service, like the renewal-reminder scheduler.
// Every minute it claims due tasks (a conditional PATCH on next_run_at, so only one replica runs each), runs the agent
// read-only (SCHEDULED_RUN_TOOLS: read + propose), stores the run in assistant_task_runs and emails the result.
// Proposed changes are never applied here: they wait in the run for the admin's Confirm in the app.
// Set ASSISTANT_TASKS_DISABLED=1 to switch the runner off.

import { AGENT_SYSTEM_PROMPT, SCHEDULED_RUN_PROMPT, SCHEDULED_RUN_TOOLS, runAgent } from './qiAgent.mjs'
import { describeSchedule, nextRunAt } from './assistantSchedule.mjs'
import { loadAgentModel } from './qiAssistant.mjs'

const TICK_MS = 60 * 1000
const MAX_PER_TICK = 3

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
}

/** The agent's short Markdown report as simple email HTML (bold, lists, line breaks). */
function reportHtml(title, schedule, reply, proposalCount) {
  const body = escapeHtml(reply)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/^\s*[-*]\s+(.*)$/gm, '&bull; $1')
    .replace(/\n/g, '<br>')
  const pending = proposalCount
    ? `<p style="margin:16px 0 0;padding:8px 10px;border:1px solid #d97706;background:#fffbeb">${proposalCount} change${proposalCount === 1 ? '' : 's'} prepared — open QE Assistant → Scheduled Tasks in Consultancy Pro to confirm.</p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;font-size:14px;color:#1c1917">
<p style="margin:0 0 4px;font-size:16px"><b>${escapeHtml(title)}</b></p>
<p style="margin:0 0 12px;color:#78716c;font-size:12px">${escapeHtml(schedule)} · QE Assistant</p>
<div>${body}</div>${pending}</div>`
}

/**
 * @param {{ rest: Function, serviceRest: Function, sendEmail: Function }} deps
 *   rest: service-role PostgREST returning data; serviceRest: service-role PostgREST returning { data, total }
 *   (for the agent tools); sendEmail: Resend sender.
 */
export function createAssistantTaskRunner({ rest, serviceRest, sendEmail }) {
  let running = false

  async function runTask(task) {
    const now = new Date()
    const next = task.schedule_kind === 'once' ? null : nextRunAt(task, now)
    // Claim: only the replica whose PATCH still sees the old next_run_at runs it.
    const claimed = await rest(
      `/assistant_tasks?id=eq.${task.id}&enabled=eq.true&next_run_at=eq.${encodeURIComponent(task.next_run_at)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          next_run_at: next ? next.toISOString() : null,
          enabled: Boolean(next),
          last_run_at: now.toISOString(),
          last_status: 'running',
        }),
      },
    )
    if (!Array.isArray(claimed) || !claimed.length) return

    const [run] = await rest('/assistant_task_runs', {
      method: 'POST',
      body: JSON.stringify({ task_id: task.id, user_id: task.user_id }),
    })
    let status = 'ok'
    let output = ''
    let agent = null
    try {
      const { callModel } = await loadAgentModel(rest)
      const memories = await rest(
        `/assistant_memories?user_id=eq.${task.user_id}&select=kind,content&order=created_at.asc&limit=100`,
      ).catch(() => [])
      const memoryBlock = Array.isArray(memories) && memories.length
        ? `ADMIN MEMORY (follow the instructions, use the facts):\n${memories.map((m) => `- (${m.kind}) ${String(m.content).slice(0, 600)}`).join('\n')}`
        : ''
      const today = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'short' })
      const result = await runAgent({
        callModel,
        userRest: serviceRest,
        routes: [],
        allowedTools: SCHEDULED_RUN_TOOLS,
        schemaKey: 'scheduled',
        messages: [
          {
            role: 'system',
            content: [
              'You are QE Assistant inside Consultancy Pro (BIS licensing consultancy).',
              AGENT_SYSTEM_PROMPT,
              SCHEDULED_RUN_PROMPT,
              `Now: ${today} (India time).`,
              memoryBlock,
            ].filter(Boolean).join('\n\n'),
          },
          { role: 'user', content: `Scheduled task “${task.title}”:\n${task.instruction}` },
        ],
      })
      output = result.reply
      agent = { steps: result.steps, proposals: result.proposals, navigation: [] }
    } catch (err) {
      status = 'error'
      output = `The task could not run: ${err instanceof Error ? err.message : String(err)}`
      console.error('[assistant-tasks] run failed', task.id, err)
    }

    let emailed = false
    if (task.notify_email) {
      try {
        await sendEmail({
          to: task.notify_email,
          subject: `QE Assistant — ${task.title}${status === 'error' ? ' (Failed)' : ''}`,
          html: reportHtml(task.title, describeSchedule(task), output, agent?.proposals?.length ?? 0),
          text: output,
        })
        emailed = true
      } catch (err) {
        console.error('[assistant-tasks] email failed', task.id, err instanceof Error ? err.message : err)
      }
    }

    await rest(`/assistant_task_runs?id=eq.${run.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status, output, agent, emailed, finished_at: new Date().toISOString() }),
    }).catch((err) => console.error('[assistant-tasks] saving the run failed', run.id, err))
    await rest(`/assistant_tasks?id=eq.${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ last_status: status }),
    }).catch(() => undefined)
  }

  async function tick() {
    if (running) return
    running = true
    try {
      const due = await rest(
        `/assistant_tasks?enabled=eq.true&next_run_at=lte.${encodeURIComponent(new Date().toISOString())}&select=*&order=next_run_at.asc&limit=${MAX_PER_TICK}`,
      )
      for (const task of Array.isArray(due) ? due : []) {
        await runTask(task).catch((err) => console.error('[assistant-tasks] task failed', task.id, err))
      }
    } catch (err) {
      // e.g. before the assistant_tasks migration runs
      if (!/assistant_tasks/.test(String(err?.message ?? ''))) console.error('[assistant-tasks] tick failed', err)
    } finally {
      running = false
    }
  }

  return { tick }
}

export function startAssistantScheduler(deps) {
  if (String(process.env.ASSISTANT_TASKS_DISABLED || '') === '1') {
    console.log('[assistant-tasks] disabled (ASSISTANT_TASKS_DISABLED=1)')
    return
  }
  const { tick } = createAssistantTaskRunner(deps)
  setTimeout(() => void tick(), 30 * 1000)
  setInterval(() => void tick(), TICK_MS)
  console.log('[assistant-tasks] scheduler started')
}
