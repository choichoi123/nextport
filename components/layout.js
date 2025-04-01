import Header from "./header"
import Footer from "./footer"
import { Analytics } from "@vercel/analytics/react"
import { Insights } from './insights';

export default function Layout({ children }) {
    return (
        <div className="bg-primary">
            <Header/>
            <Analytics />
            <Insights />
            <div>{children}</div>
            <Footer/>
        </div>
    )
}