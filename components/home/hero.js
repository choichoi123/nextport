import Animation from '@/components/animation'
import Link from 'next/link';

export default function Hero() {
    return (

        <>
            <div className="lg:flex-grow md:w-1/2 lg:pr-24 md:pr-16 flex flex-col md:items-start md:text-left mb-16 md:mb-0 items-center text-center">
                <h1 className="title-font sm:text-4xl text-3xl mb-4 font-medium text-gray-900">안녕하세요! 개발자 최지훈입니다!!
                    <br className="hidden lg:inline-block" />주어진 일을 끝까지하는 개발자입니다.
                </h1>
                <p className="mb-8 leading-relaxed">자신의 본질을 깨닫고 본인이 무엇을 잘할 수 있으며, 현재 가능한 것들을 생각하여, 자신의 책임과 역할이 무엇인지 묻고, 최선의 선택지와 최고의 결과로 이끌고 가는 것이 제일 중요하다. 그러기 때문에 자기 일에 넘치는 상황에 닥치게 되면 거부하는 경향이 있기 때문에 이를 무조건 거부하기보다 더 잘 생각해보고 내가 할 수 있게 시도해 보는 자세도 굉장히 중요하다. 자신의 상황에 순응하며 안주하기보다는 항상 더 나은 미래를 위해 발전하는 것이 중요하다 생각된다.</p>
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