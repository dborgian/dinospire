// Augment React.JSX.IntrinsicElements so that R3F Three.js elements (mesh,
// ambientLight, etc.) are recognised under the react-jsx automatic transform.
// The global `JSX` namespace augmentation in @react-three/fiber only covers
// the classic transform; react-jsx uses `React.JSX` instead.
import type { ThreeElements } from "@react-three/fiber";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements extends ThreeElements {}
  }
}
