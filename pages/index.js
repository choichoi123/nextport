import PortfolioHome from '@/components/portfolio/portfolio-home'
import { TOKEN, DATABASE_ID, DATA_SOURCE_ID } from '@/config'
import { loadPortfolioProjects } from '@/lib/portfolio-preview.mjs'

export default function Home(props) {
  return <PortfolioHome {...props} />
}

export async function getStaticProps() {
  const data = await loadPortfolioProjects({ token: TOKEN, databaseId: DATABASE_ID, dataSourceId: DATA_SOURCE_ID })
  return { props: data, revalidate: 1 }
}
