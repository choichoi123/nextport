import Layout from "../components/layout"
import Head from "next/head"
import { TOKEN, DATABASE_ID, DATA_SOURCE_ID } from "@/config";
import { getNotionProjects } from "@/lib/notion.mjs";
import ProjectItem from "@/components/projects/project-item";

export default function projects({ projects }) {

  // console.log(projects)

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-screen px-3 mb-10">
        <Head>
          <title>최지훈 포트폴리오</title>
          <meta name="description" content="포트폴리오 만들기!!" />
          <link rel="icon" href="/favicon.ico" />
        </Head>
        <h1 className="text-4xl font-bold sm:text-6xl">
          총 프로젝트 : 
          <span className="pl-4 text-blue-500">{projects.results.length}</span>
          </h1>

        <div className="grid grid-cols-1 md:grid-cols-2 py-10 m-6 gap-8">
          {projects.results.map((aProject) => (
            <ProjectItem key={aProject.id} data={aProject} />
          ))}
        </div>

      </div>
    </Layout>
  )
}

export async function getStaticProps() {
  const projects = await getNotionProjects({
    token: TOKEN,
    databaseId: DATABASE_ID,
    dataSourceId: DATA_SOURCE_ID,
  });

  return { props: { projects }, revalidate: 1 };
}
