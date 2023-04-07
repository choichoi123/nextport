import Image from "next/legacy/image";

export default function ProjectItem({ data }) {

    const tittle = data.properties.Name.title[0].plain_text
    const github = data.properties.GitHub.url
    const youtube = data.properties.Youtube.url
    const description = data.properties.Description.rich_text[0].plain_text
    const imgscr = data.cover.file?.url || data.cover.external.url
    const tags = data.properties.Tags.multi_select
    const start = data.properties.WorkPeriod.date.start
    const end = data.properties.WorkPeriod.date.end

    const calculatePeriod = (start, end) => {
      const startDateStringArray = start.split('-');
      const endtDateStringArray = end.split('-');

      let startDate = new Date(startDateStringArray[0], startDateStringArray[1], startDateStringArray[2]);
      let endDate = new Date(endtDateStringArray[0], endtDateStringArray[1], endtDateStringArray[2])

      console.log(`startDate: ${startDate}`)
      console.log(`endDate: ${endDate}`)

      const diffInMs = Math.abs(endDate - startDate);
      const result = diffInMs / (1000 * 60 * 60 * 24);

      console.log(`기간: ${result}`)
      return result;
    };

    return (
        <div className="project-card">

            <Image
                className="rounded-t-xl"
                src={imgscr}
                alt="cover image"
                width="100%"
                height="60%"
                layout="responsive"
                objectFit="none"
                quality={100}
            />

            <div className="p-4 flex flex-col">
                <h1 className="text-2xl font-bold">{tittle}</h1>
                <h3 className="mt-4 text-xl">{description}</h3>
                <a href={github}>GitHub 바로가기</a>
                <a href={youtube}>YouTube 바로가기</a>
                <p className="my-1">작업기간: {start} ~ {end} ({calculatePeriod(start, end)})일</p>
                <div className="flex items-start mt-z">
                    {tags.map((aTag) => (
                        <h1 className="px-2 py-1 mr-2 rounded-md bg-sky-200 dark:bg-sky-700 w-30" key={aTag.id}>
                            {aTag.name}
                        </h1>
                    ))}

                </div>
            </div>

        </div>
    );
}