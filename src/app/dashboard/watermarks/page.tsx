"use client"

import { useState, useEffect } from "react"
import { Eye, Settings2, Palette, Type } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"

const STORAGE_KEY = "krypts_watermark_settings"

interface WatermarkSettings {
  enabled: boolean
  text: string
  opacity: number[]
  density: number[]
  colorScheme: string
}

const defaults: WatermarkSettings = {
  enabled: true,
  text: "Confidential - {user_id}",
  // Near-invisible during normal viewing -- the Forensic Scanner recovers
  // it via a levels/contrast boost, so it doesn't need to be visible here.
  // Below ~3% the signal falls under the noise floor of any realistic
  // capture and becomes unrecoverable no matter how the scanner is tuned.
  opacity: [5],
  density: [3],
  colorScheme: "light",
}

function loadSettings(): WatermarkSettings {
  if (typeof window === "undefined") return defaults
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return stored ? { ...defaults, ...JSON.parse(stored) } : defaults
  } catch { return defaults }
}

export default function WatermarkSettingsPage() {
  const [enabled, setEnabled] = useState(defaults.enabled)
  const [opacity, setOpacity] = useState(defaults.opacity)
  const [density, setDensity] = useState(defaults.density)
  const [text, setText] = useState(defaults.text)
  const [colorScheme, setColorScheme] = useState(defaults.colorScheme)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const s = loadSettings()
    setEnabled(s.enabled)
    setOpacity(s.opacity)
    setDensity(s.density)
    setText(s.text)
    setColorScheme(s.colorScheme)
  }, [])

  const handleSave = () => {
    setSaving(true)
    const settings: WatermarkSettings = { enabled, text, opacity, density, colorScheme }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
    setTimeout(() => {
      setSaving(false)
      toast.success("Watermark configuration saved successfully.")
    }, 400)
  }
  
  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight">Watermark Settings</h1>
        <p className="text-muted-foreground">Configure global dynamic watermarking overlaid on videos, PDFs, and images.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-8">
        
        {/* Editor */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Settings2 className="h-5 w-5" /> Global Configuration</CardTitle>
              <CardDescription>
                These settings will apply to all content where dynamic watermarking is enabled.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-8">
              
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label className="text-base font-medium">Enable Global Watermarking</Label>
                    <p className="text-sm text-muted-foreground">Force watermarks on all content viewers.</p>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>

              <div className="space-y-4 pt-4 border-t">
                <h4 className="flex items-center gap-2 font-medium"><Type className="h-4 w-4" /> Text Content</h4>
                <div className="space-y-2">
                  <Label>Watermark Pattern</Label>
                  <Input 
                    value={text} 
                    onChange={(e) => setText(e.target.value)} 
                    placeholder="e.g. Property of Krypts - {email}" 
                  />
                  <p className="text-xs text-muted-foreground">
                    Available custom variables: <code className="bg-muted px-1 rounded">{"{user_id}"}</code>, <code className="bg-muted px-1 rounded">{"{email}"}</code>, <code className="bg-muted px-1 rounded">{"{ip_address}"}</code>, <code className="bg-muted px-1 rounded">{"{timestamp}"}</code>
                  </p>
                </div>
              </div>

              <div className="space-y-6 pt-4 border-t">
                <h4 className="flex items-center gap-2 font-medium"><Palette className="h-4 w-4" /> Appearance</h4>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Opacity</Label>
                    <span className="text-sm text-muted-foreground">{opacity}%</span>
                  </div>
                  <Slider 
                    value={opacity} 
                    onValueChange={(val) => setOpacity(Array.isArray(val) ? [...val] : [val])} 
                    max={100} 
                    step={1} 
                    className="cursor-pointer"
                  />
                </div>
                
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <Label>Density</Label>
                    <span className="text-sm text-muted-foreground">{density}</span>
                  </div>
                  <Slider 
                    value={density} 
                    onValueChange={(val) => setDensity(Array.isArray(val) ? [...val] : [val])} 
                    max={10} 
                    min={1}
                    step={1} 
                    className="cursor-pointer"
                  />
                  <p className="text-xs text-muted-foreground">Controls how densely packed the watermark grid is.</p>
                </div>

                <div className="space-y-3">
                  <Label>Color Scheme</Label>
                  <RadioGroup value={colorScheme} onValueChange={(v) => v && setColorScheme(v)} className="flex gap-4">
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="light" id="r1" />
                      <Label htmlFor="r1" className="text-slate-200 bg-slate-800 px-3 py-1 rounded">Light</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="dark" id="r2" />
                      <Label htmlFor="r2" className="text-slate-800 bg-slate-200 px-3 py-1 rounded">Dark</Label>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="auto" id="r3" />
                      <Label htmlFor="r3" className="text-foreground">Auto-Contrast</Label>
                    </div>
                  </RadioGroup>
                </div>
              </div>

            </CardContent>
            <CardFooter className="bg-muted/50 border-t py-4">
              <Button className="w-full" onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save Configuration"}
              </Button>
            </CardFooter>
          </Card>
        </div>

        {/* Live Preview */}
        <div className="space-y-6">
          <Card className="h-full flex flex-col">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-sm text-muted-foreground"><Eye className="h-4 w-4" /> Live Preview</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 px-6 pb-6">
              <div className="w-full h-full min-h-[400px] border-2 border-dashed rounded-xl bg-slate-100 dark:bg-slate-900 relative overflow-hidden flex items-center justify-center">
                
                {/* Simulated Content */}
                <div className="text-center p-8 bg-white dark:bg-black rounded-lg shadow-sm border max-w-sm z-0">
                  <div className="h-32 bg-slate-200 dark:bg-slate-800 rounded-md mb-4 flex items-center justify-center">
                    <span className="text-slate-400 font-medium">Sample Document</span>
                  </div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-3/4 mx-auto mb-2"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-full mx-auto mb-2"></div>
                  <div className="h-4 bg-slate-200 dark:bg-slate-800 rounded w-5/6 mx-auto"></div>
                </div>

                {/* Simulated Watermark Overlay */}
                <div 
                  className="absolute inset-0 z-10 pointer-events-none flex flex-wrap content-start overflow-hidden"
                  style={{ opacity: opacity[0] / 100 }}
                >
                  <style dangerouslySetInnerHTML={{__html: `
                    .watermark-grid {
                      display: grid;
                      grid-template-columns: repeat(\${density[0]}, 1fr);
                      grid-template-rows: repeat(\${density[0] * 2}, 1fr);
                      width: 150%;
                      height: 150%;
                      transform: rotate(-30deg) translate(-10%, -20%);
                    }
                    .watermark-item {
                      display: flex;
                      align-items: center;
                      justify-content: center;
                      font-family: monospace;
                      font-weight: bold;
                      font-size: \${Math.max(10, 30 - density[0] * 1.5)}px;
                      color: currentColor;
                      white-space: nowrap;
                    }
                  `}} />
                  <div className="watermark-grid text-slate-900 dark:text-slate-100">
                    {Array.from({ length: density[0] * density[0] * 4 }).map((_, i) => (
                      <div key={i} className="watermark-item">
                        {text.replace('{user_id}', 'user_12345').replace('{email}', 'test@example.com')}
                      </div>
                    ))}
                  </div>
                </div>

              </div>
            </CardContent>
          </Card>
        </div>

      </div>
    </div>
  )
}
