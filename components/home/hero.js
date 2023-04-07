import Animation from '@/components/animation'
import Link from 'next/link';

export default function Hero() {
    return (

        <>
            <div className="lg:flex-grow md:w-1/2 lg:pr-24 md:pr-16 flex flex-col md:items-start md:text-left mb-16 md:mb-0 items-center text-center">
                <h1 className="title-font sm:text-4xl text-3xl mb-4 font-medium text-gray-900">안녕하세요 최지훈입니다!
                    <br className="hidden lg:inline-block" />오늘도 즐겁게 개발해봅시다!
                </h1>
                <p className="mb-8 leading-relaxed">있는 때에, 것이다.보라, 긴지라 쓸쓸하랴? 방황하여도, 실현에 길지 더운지라 사라지지 가치를 용기가 것이다. 열락의 돋고, 청춘 그들을 시들어 있는 보는 끓는 있는가? 많이 예가 피고, 새가 따뜻한 인간의 예수는 있는가? 불러 용감하고 눈에 방황하여도, 얼음 칼이다. 사는가 심장의 내는 원대하고, 찾아다녀도, 말이다. 불어 용기가 우리 실로 피어나는 것이다. 곳이 대중을 못하다 용감하고 같지 뭇 그들의 발휘하기 교향악이다. 같은 그들의 따뜻한 곧 말이다. 되는 수 커다란 발휘하기 군영과 방황하였으며, 창공에 풍부하게 노년에게서 것이다. 천하를 이상은 만물은 것은 듣는다.</p>
                <div className="flex justify-center">
                    <Link href="/projects" className="btn-project">
                        프로젝트 보러 가기
                    </Link>
                </div>
            </div>
            <div className="lg:max-w-lg lg:w-full md:w-1/2 w-5/6"><Animation /></div>
        </>
    );
}