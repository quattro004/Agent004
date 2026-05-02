/**
 * WireframeBackdrop — R3F component with rotating wireframe shapes.
 * Cyan/magenta palette, EdgesGeometry for wireframe look.
 * Reduces shape count on mobile (8 → 4).
 */

import { Canvas, useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface WireframeShapeProps {
  geometry: THREE.BufferGeometry;
  color: string;
  position: [number, number, number];
  rotationSpeed: [number, number, number];
}

function WireframeShape({ geometry, color, position, rotationSpeed }: WireframeShapeProps) {
  const meshRef = useRef<THREE.LineSegments>(null);
  const edges = useMemo(() => new THREE.EdgesGeometry(geometry), [geometry]);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += rotationSpeed[0] * delta;
      meshRef.current.rotation.y += rotationSpeed[1] * delta;
      meshRef.current.rotation.z += rotationSpeed[2] * delta;
    }
  });

  return (
    <lineSegments ref={meshRef} position={position} geometry={edges}>
      <lineBasicMaterial color={color} transparent opacity={0.3} />
    </lineSegments>
  );
}

interface ShapeConfig {
  type: 'box' | 'cone' | 'icosahedron';
  position: [number, number, number];
  color: string;
  rotationSpeed: [number, number, number];
}

const SHAPES: ShapeConfig[] = [
  { type: 'box', position: [-3, 2, -5], color: '#00ffff', rotationSpeed: [0.2, 0.3, 0.1] },
  { type: 'cone', position: [3, -1, -4], color: '#ff00ff', rotationSpeed: [0.1, 0.2, 0.3] },
  { type: 'icosahedron', position: [-2, -2, -6], color: '#00ffff', rotationSpeed: [0.3, 0.1, 0.2] },
  { type: 'box', position: [2, 3, -7], color: '#ff00ff', rotationSpeed: [0.15, 0.25, 0.05] },
  { type: 'cone', position: [-4, 0, -5], color: '#00ffff', rotationSpeed: [0.25, 0.15, 0.2] },
  { type: 'icosahedron', position: [4, 1, -6], color: '#ff00ff', rotationSpeed: [0.1, 0.3, 0.15] },
  { type: 'box', position: [0, -3, -8], color: '#00ffff', rotationSpeed: [0.2, 0.1, 0.3] },
  { type: 'cone', position: [1, 4, -5], color: '#ff00ff', rotationSpeed: [0.3, 0.2, 0.1] },
];

function createGeometry(type: ShapeConfig['type']): THREE.BufferGeometry {
  switch (type) {
    case 'box':
      return new THREE.BoxGeometry(1, 1, 1);
    case 'cone':
      return new THREE.ConeGeometry(0.6, 1.2, 6);
    case 'icosahedron':
      return new THREE.IcosahedronGeometry(0.8, 0);
  }
}

interface WireframeBackdropProps {
  isMobile: boolean;
}

export function WireframeBackdrop({ isMobile }: WireframeBackdropProps) {
  const shapes = isMobile ? SHAPES.slice(0, 4) : SHAPES;

  return (
    <div
      data-testid="wireframe-backdrop"
      style={{ position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none' }}
    >
      <Canvas camera={{ position: [0, 0, 5], fov: 60 }}>
        <ambientLight intensity={0.1} />
        {shapes.map((shape, i) => (
          <WireframeShape
            key={i}
            geometry={createGeometry(shape.type)}
            color={shape.color}
            position={shape.position}
            rotationSpeed={shape.rotationSpeed}
          />
        ))}
      </Canvas>
    </div>
  );
}
