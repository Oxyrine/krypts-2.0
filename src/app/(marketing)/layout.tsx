import { Navbar } from "@/components/layout/Navbar"
import { Footer } from "@/components/layout/Footer"

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // The `dark` class here activates all Tailwind dark: variants for
    // every child section so the marketing page always looks dark,
    // regardless of the user's system or app theme setting.
    <div className="dark flex min-h-screen flex-col bg-just-black">
      <Navbar />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
