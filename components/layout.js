import Header from "./header"
import Footer from "./footer"
import { Analytics } from "@vercel/analytics/react"
import { SpeedInsights } from "@vercel/speed-insights/next"

export default function Layout({ children }) {
    return (
        <div className="bg-primary">
            <Header/>
            <Analytics />
            <SpeedInsights />
            <div>{children}</div>
            <Footer/>
        </div>
    )
}