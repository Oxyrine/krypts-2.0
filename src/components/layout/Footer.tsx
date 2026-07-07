import Link from "next/link"
import { Shield, Github, Twitter, Linkedin } from "lucide-react"

export function Footer() {
  return (
    <footer className="border-t bg-muted/40 text-muted-foreground w-full py-12 px-4 md:px-8">
      <div className="container mx-auto grid gap-8 md:grid-cols-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <Link href="/" className="flex items-center gap-2 mb-4">
            <Shield className="h-6 w-6 text-primary" />
            <span className="font-bold text-foreground">Krypts</span>
          </Link>
          <p className="text-sm max-w-xs mb-6">
            The complete Digital Rights Management platform. Protect your content, monitor access, and stop piracy with plug-and-play APIs.
          </p>
          <div className="flex items-center gap-4">
            <Link href="#" className="hover:text-foreground transition-colors"><Twitter className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-foreground transition-colors"><Github className="h-5 w-5" /></Link>
            <Link href="#" className="hover:text-foreground transition-colors"><Linkedin className="h-5 w-5" /></Link>
          </div>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-4">Product</h3>
          <ul className="space-y-3 text-sm">
            <li><Link href="#features" className="hover:text-foreground transition-colors">Features</Link></li>
            <li><Link href="#pricing" className="hover:text-foreground transition-colors">Pricing</Link></li>
            <li><Link href="#use-cases" className="hover:text-foreground transition-colors">Use Cases</Link></li>
            <li><Link href="/changelog" className="hover:text-foreground transition-colors">Changelog</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-4">Developers</h3>
          <ul className="space-y-3 text-sm">
            <li><Link href="/docs" className="hover:text-foreground transition-colors">Documentation</Link></li>
            <li><Link href="/api" className="hover:text-foreground transition-colors">API Reference</Link></li>
            <li><Link href="/status" className="hover:text-foreground transition-colors">Status</Link></li>
          </ul>
        </div>
        <div>
          <h3 className="font-semibold text-foreground mb-4">Legal</h3>
          <ul className="space-y-3 text-sm">
            <li><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link></li>
          </ul>
        </div>
      </div>
      <div className="container mx-auto mt-12 pt-8 border-t text-sm text-center">
        © {new Date().getFullYear()} Krypts DRM Inc. All rights reserved.
      </div>
    </footer>
  )
}
