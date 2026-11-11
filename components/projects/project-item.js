import Image from "next/legacy/image";

function parseDate(value) {
    if (typeof value !== "string") return null;

    const date = value.slice(0, 10);
    const timestamp = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString().slice(0, 10) !== date) {
        return null;
    }

    return { date, timestamp };
}

export default function ProjectItem({ data }) {
    const properties = data?.properties || {};
    const title = properties.Name?.title?.map((part) => part.plain_text || "").join("").trim() || "제목 없는 프로젝트";
    const description = properties.Description?.rich_text?.map((part) => part.plain_text || "").join("").trim();
    const github = properties.GitHub?.url;
    const youtube = properties.Youtube?.url;
    const imgsrc = data?.cover?.file?.url || data?.cover?.external?.url;
    const tags = properties.Tags?.multi_select || [];
    const start = parseDate(properties.WorkPeriod?.date?.start);
    const end = parseDate(properties.WorkPeriod?.date?.end);
    const linkurl = data?.url;
    const period = start && end ? Math.abs(end.timestamp - start.timestamp) / 86400000 : null;
    const workPeriod = start
        ? `${start.date} ~ ${end?.date || "진행 중"}${period !== null ? ` (${period}일)` : ""}`
        : end ? `미정 ~ ${end.date}` : "미정";

    const cover = imgsrc ? (
        <Image
            className="rounded-t-xl"
            src={imgsrc}
            alt={`${title} 표지`}
            width={1000}
            height={500}
            layout="responsive"
            objectFit="none"
            quality={100}
        />
    ) : (
        <div className="flex aspect-[2/1] items-center justify-center rounded-t-xl bg-gray-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400">
            이미지 없음
        </div>
    );
    const summary = (
        <>
            <h1 className="text-2xl font-bold">{title}</h1>
            {description && <h3 className="mt-4 text-xl">{description}</h3>}
        </>
    );

    return (
        <div className="project-card">
            {linkurl ? (
                <a href={linkurl} target="_blank" rel="noopener noreferrer">{cover}</a>
            ) : cover}
            <div className="p-4 flex flex-col">
                {linkurl ? (
                    <a href={linkurl} target="_blank" rel="noopener noreferrer">{summary}</a>
                ) : summary}
                {github && <a href={github}>GitHub 바로가기</a>}
                {youtube && <a href={youtube}>YouTube 바로가기</a>}
                <p className="my-1">작업기간: {workPeriod}</p>
                {tags.length > 0 && (
                    <div className="flex flex-wrap items-start mt-2">
                        {tags.map((tag) => (
                            <span className="px-2 py-1 mr-2 rounded-md bg-sky-200 dark:bg-sky-700" key={tag.id || tag.name}>
                                {tag.name}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
