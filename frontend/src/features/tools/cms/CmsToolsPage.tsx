import { Globe } from 'lucide-react'
import { limsPageShellClass, limsPanelClass } from '@/lib/limsThemeUi'
import { cn } from '@/lib/utils'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import CmsServicesPanel from './CmsServicesPanel'
import CmsNewsPanel from './CmsNewsPanel'
import CmsSettingsPanel from './CmsSettingsPanel'

const tabTriggerClass =
  'rounded-none px-4 data-[state=active]:bg-amber-700 data-[state=active]:text-white data-[state=active]:shadow-none'

export default function CmsToolsPage() {
  return (
    <div className={cn(limsPageShellClass, 'space-y-4 p-4 md:p-6')}>
      <div className={cn(limsPanelClass, 'p-6')}>
        <div className="flex items-center gap-2">
          <Globe className="h-5 w-5 text-amber-700" />
          <h1 className="font-jakarta text-2xl font-bold tracking-tight text-foreground">Website CMS</h1>
        </div>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Manage the services, news and contact details shown on the public company website.
        </p>
      </div>

      <div className={limsPanelClass}>
        <Tabs defaultValue="services">
          <div className="border-b-2 border-stone-500 bg-stone-100 p-2">
            <TabsList className="h-9 rounded-none bg-stone-200 p-0.5">
              <TabsTrigger value="services" className={tabTriggerClass}>
                Services
              </TabsTrigger>
              <TabsTrigger value="news" className={tabTriggerClass}>
                News
              </TabsTrigger>
              <TabsTrigger value="settings" className={tabTriggerClass}>
                Site Settings
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="services" className="mt-0">
            <CmsServicesPanel />
          </TabsContent>
          <TabsContent value="news" className="mt-0">
            <CmsNewsPanel />
          </TabsContent>
          <TabsContent value="settings" className="mt-0">
            <CmsSettingsPanel />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
