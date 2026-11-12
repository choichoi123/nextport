import PortfolioHome from '@/components/portfolio/portfolio-home'
import { TOKEN, DATABASE_ID, DATA_SOURCE_ID } from '@/config'
import { loadPortfolioPreview } from '@/lib/portfolio-preview.mjs'

export default function Preview(props) {
  return <PortfolioHome {...props} preview />
}

export async function getStaticProps({ locale } = {}) {
  const data = await loadPortfolioPreview({ token: TOKEN, databaseId: DATABASE_ID, dataSourceId: DATA_SOURCE_ID }, { locale })
  return { props: data, revalidate: 1 }
}
