import { useRouter } from 'next/router'
import PlaygroundShell from '@/components/playground/playground-shell'
import ControlsDemo from '@/components/playground/controls-demo'

export default function PlaygroundControls() {
  const english = useRouter().locale === 'en'
  return (
    <PlaygroundShell
      title={english ? 'Keyboard Controls Lab | Jihoon Choi' : '키보드 조작 테스트 | 최지훈'}
      description={english ? 'Try arrow-key movement and the spacebar in a small interactive playground.' : '방향키 이동과 스페이스바 동작을 확인하는 작은 조작 실험입니다.'}
    >
      <ControlsDemo />
    </PlaygroundShell>
  )
}
