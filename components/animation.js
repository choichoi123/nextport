import dynamic from 'next/dynamic'
import lottieJson from '../public/animation.json'

const Lottie = dynamic(() => import('react-lottie-player'), { ssr: false })

export default function Animation() {
  return (
    <Lottie
      loop
      animationData={lottieJson}
      play
    />
  )
}
