import { useRef, useState } from 'react'
import { limsPageShellClass } from '@/lib/limsThemeUi'
import { Tabs, TabsContent } from '@/components/ui/tabs'
import { AiSettingsHeaderBar, type AiSettingsTab } from './AiSettingsHeaderBar'
import { AiModelsPanel, type AiModelsPanelHandle } from './AiModelsPanel'
import { AiSkillsPanel, type AiSkillsPanelHandle } from './AiSkillsPanel'
import { AiGeneralPanel, type AiGeneralPanelHandle } from './AiGeneralPanel'

export default function AiSettingsMasterPage() {
  const [activeTab, setActiveTab] = useState<AiSettingsTab>('models')
  const [searchQuery, setSearchQuery] = useState('')
  const [generalSaving, setGeneralSaving] = useState(false)

  const modelsRef = useRef<AiModelsPanelHandle>(null)
  const skillsRef = useRef<AiSkillsPanelHandle>(null)
  const generalRef = useRef<AiGeneralPanelHandle>(null)

  const handlePrimaryAction = () => {
    if (activeTab === 'models') modelsRef.current?.openCreate()
    else if (activeTab === 'skills') skillsRef.current?.openCreate()
    else generalRef.current?.save()
  }

  return (
    <div className={limsPageShellClass}>
      <Tabs
        value={activeTab}
        onValueChange={(v) => {
          setActiveTab(v as AiSettingsTab)
          setSearchQuery('')
        }}
        className="space-y-5"
      >
        <AiSettingsHeaderBar
          activeTab={activeTab}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onPrimaryAction={handlePrimaryAction}
          saving={generalSaving}
        />

        <TabsContent value="models" className="mt-0 space-y-5 focus-visible:outline-none">
          <AiModelsPanel ref={modelsRef} searchQuery={searchQuery} />
        </TabsContent>

        <TabsContent value="skills" className="mt-0 space-y-5 focus-visible:outline-none">
          <AiSkillsPanel ref={skillsRef} searchQuery={searchQuery} />
        </TabsContent>

        <TabsContent value="general" className="mt-0 focus-visible:outline-none">
          <AiGeneralPanel ref={generalRef} onSavingChange={setGeneralSaving} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
