"use client";

import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { AgentState } from "@/lib/types";

interface AIFaceProps {
  state: AgentState;
}

// ========== Wireframe Face Mesh ==========
function FaceMesh({ state }: { state: AgentState }) {
  const meshRef = useRef<THREE.Group>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const timeRef = useRef(0);

  // Track mouse for subtle head tracking
  useEffect(() => {
    const handleMouse = (e: MouseEvent) => {
      setMousePos({
        x: (e.clientX / window.innerWidth - 0.5) * 2,
        y: (e.clientY / window.innerHeight - 0.5) * 2,
      });
    };
    window.addEventListener("mousemove", handleMouse);
    return () => window.removeEventListener("mousemove", handleMouse);
  }, []);

  // Colors based on state
  const colors = useMemo(() => {
    switch (state) {
      case "idle":
        return { primary: "#00d4ff", secondary: "#7c3aed", glow: "#00d4ff" };
      case "listening":
        return { primary: "#22c55e", secondary: "#16a34a", glow: "#22c55e" };
      case "thinking":
        return { primary: "#f59e0b", secondary: "#d97706", glow: "#f59e0b" };
      case "searching":
        return { primary: "#3b82f6", secondary: "#2563eb", glow: "#3b82f6" };
      case "reading":
        return { primary: "#06b6d4", secondary: "#0e7490", glow: "#06b6d4" };
      case "speaking":
        return { primary: "#00d4ff", secondary: "#7c3aed", glow: "#00d4ff" };
      case "waiting":
        return { primary: "#f59e0b", secondary: "#ea580c", glow: "#f59e0b" };
      case "error":
        return { primary: "#ef4444", secondary: "#dc2626", glow: "#ef4444" };
      default:
        return { primary: "#00d4ff", secondary: "#7c3aed", glow: "#00d4ff" };
    }
  }, [state]);

  const primaryColor = useMemo(() => new THREE.Color(colors.primary), [colors]);

  // Create wireframe geometry - abstract face shape
  const faceGeometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const points: THREE.Vector3[] = [];
    const segments = 32;
    const faceW = 2.4;
    const faceH = 3.0;

    // Outer face contour
    for (let i = 0; i <= segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const x = Math.cos(theta) * faceW * 0.5;
      const y = Math.sin(theta) * faceH * 0.5;
      const chinFactor = y < 0 ? 1 - Math.abs(y) / faceH * 0.15 : 1;
      points.push(new THREE.Vector3(x * chinFactor, y, 0));
    }

    // Eyes
    const eyeY = 0.5;
    const eyeSpacing = 0.7;
    points.push(new THREE.Vector3(-eyeSpacing, eyeY, 0.3));
    points.push(new THREE.Vector3(-eyeSpacing - 0.25, eyeY + 0.1, 0.3));
    points.push(new THREE.Vector3(-eyeSpacing + 0.25, eyeY + 0.1, 0.3));
    points.push(new THREE.Vector3(eyeSpacing, eyeY, 0.3));
    points.push(new THREE.Vector3(eyeSpacing - 0.25, eyeY + 0.1, 0.3));
    points.push(new THREE.Vector3(eyeSpacing + 0.25, eyeY + 0.1, 0.3));

    // Nose bridge
    points.push(new THREE.Vector3(0, 0.8, 0.4));
    points.push(new THREE.Vector3(0, 0.2, 0.5));
    points.push(new THREE.Vector3(0, -0.2, 0.4));

    // Mouth
    points.push(new THREE.Vector3(-0.5, -0.6, 0.2));
    points.push(new THREE.Vector3(-0.3, -0.7, 0.2));
    points.push(new THREE.Vector3(0, -0.75, 0.2));
    points.push(new THREE.Vector3(0.3, -0.7, 0.2));
    points.push(new THREE.Vector3(0.5, -0.6, 0.2));

    // Cheek lines
    points.push(new THREE.Vector3(-1.0, 0.2, 0.1));
    points.push(new THREE.Vector3(-1.0, -0.3, 0.1));
    points.push(new THREE.Vector3(1.0, 0.2, 0.1));
    points.push(new THREE.Vector3(1.0, -0.3, 0.1));

    // Forehead lines
    points.push(new THREE.Vector3(-0.6, 1.2, 0.1));
    points.push(new THREE.Vector3(0, 1.3, 0.1));
    points.push(new THREE.Vector3(0.6, 1.2, 0.1));

    const vertices = points.flatMap((p) => [p.x, p.y, p.z]);
    geo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));

    // Create edge indices
    const indices: number[] = [];
    for (let i = 0; i < segments; i++) {
      indices.push(i, (i + 1) % segments);
    }
    const eyeStart = segments + 1;
    indices.push(eyeStart, eyeStart + 1);
    indices.push(eyeStart, eyeStart + 2);
    indices.push(eyeStart + 3, eyeStart + 4);
    indices.push(eyeStart + 3, eyeStart + 5);
    const noseStart = eyeStart + 6;
    indices.push(noseStart, noseStart + 1);
    indices.push(noseStart + 1, noseStart + 2);
    const mouthStart = noseStart + 3;
    for (let i = 0; i < 4; i++) {
      indices.push(mouthStart + i, mouthStart + i + 1);
    }
    const cheekStart = mouthStart + 5;
    indices.push(cheekStart, cheekStart + 1);
    indices.push(cheekStart + 2, cheekStart + 3);
    const foreheadStart = cheekStart + 4;
    indices.push(foreheadStart, foreheadStart + 1);
    indices.push(foreheadStart + 1, foreheadStart + 2);

    geo.setIndex(indices);
    return geo;
  }, []);

  // Particle system
  const particleCount = 200;
  const particlePositions = useMemo(() => {
    const positions = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const r = 2.5 + Math.random() * 1.5;
      const y = (Math.random() - 0.5) * 4;
      positions[i * 3] = Math.cos(theta) * r;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 2;
    }
    return positions;
  }, []);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    timeRef.current += delta;
    const group = meshRef.current;

    // Breathing animation
    group.position.y = Math.sin(timeRef.current * 1.2) * 0.02;
    // Mouse tracking
    group.rotation.y = mousePos.x * 0.05;
    group.rotation.x = -mousePos.y * 0.05;

    // State-based pulsing
    const isActive = state === "thinking" || state === "searching";
    const isSpeaking = state === "speaking";
    const isListening = state === "listening";
    let frequency = 1;
    let amplitude = 0;
    if (isActive) { frequency = 3; amplitude = 0.015; }
    else if (isSpeaking) { frequency = 6; amplitude = 0.02; }
    else if (isListening) { frequency = 4; amplitude = 0.01; }

    if (amplitude > 0) {
      const pulse = 1 + Math.sin(timeRef.current * frequency) * amplitude;
      group.scale.setScalar(pulse);
    } else {
      group.scale.lerp(new THREE.Vector3(1, 1, 1), 0.05);
    }

    // Rotate particles
    const particles = group.children[1] as THREE.Points;
    if (particles) particles.rotation.y += delta * 0.1;

    // Animate color
    const faceLines = group.children[0] as THREE.LineSegments;
    if (faceLines?.material) {
      const mat = faceLines.material as THREE.LineBasicMaterial;
      const hueShift = Math.sin(timeRef.current * 0.3) * 0.05;
      const hsl = primaryColor.getHSL({ h: 0, s: 0, l: 0 });
      mat.color.setHSL((hsl.h + hueShift) % 1, 0.8, 0.6);
    }
  });

  return (
    <group ref={meshRef}>
      <lineSegments geometry={faceGeometry}>
        <lineBasicMaterial color={colors.primary} transparent opacity={0.8} />
      </lineSegments>
      <points>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            count={particleCount}
            array={particlePositions}
            itemSize={3}
          />
        </bufferGeometry>
        <pointsMaterial
          size={0.03}
          color={colors.glow}
          transparent
          opacity={0.4}
          sizeAttenuation
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </points>
      <mesh>
        <sphereGeometry args={[1.8, 16, 16]} />
        <meshBasicMaterial color={colors.glow} transparent opacity={0.03} wireframe />
      </mesh>
    </group>
  );
}

// ========== Main AIFace Component ==========
export default function AIFace({ state }: AIFaceProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // SSR fallback
  if (!isClient) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="relative w-64 h-80">
          <svg viewBox="-3 -3.5 6 7" className="w-full h-full opacity-60" xmlns="http://www.w3.org/2000/svg">
            <ellipse cx="0" cy="0" rx="2.4" ry="3.0" fill="none" stroke="#00d4ff" strokeWidth="0.03" opacity="0.5" />
            <circle cx="-0.7" cy="0.5" r="0.15" fill="none" stroke="#00d4ff" strokeWidth="0.02" />
            <circle cx="0.7" cy="0.5" r="0.15" fill="none" stroke="#00d4ff" strokeWidth="0.02" />
            <line x1="0" y1="0.8" x2="0" y2="-0.2" stroke="#00d4ff" strokeWidth="0.02" />
            <path d="M-0.5,-0.6 Q0,-0.9 0.5,-0.6" fill="none" stroke="#00d4ff" strokeWidth="0.02" />
          </svg>
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
            <span className={`status-dot ${state}`} />
            <span className="text-xs text-aura-muted capitalize">{state}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full min-h-[240px]">
      <Canvas
        camera={{ position: [0, 0, 6], fov: 45 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      >
        <ambientLight intensity={0.3} />
        <pointLight position={[0, 0, 5]} intensity={0.5} />
        <FaceMesh state={state} />
      </Canvas>

      {/* Status overlay */}
      <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full bg-aura-surface/80 backdrop-blur-sm border border-aura-border/50">
        <span className={`status-dot ${state}`} />
        <span className="text-xs text-aura-muted capitalize font-medium">
          {state === "idle" && "Ready"}
          {state === "listening" && "Listening..."}
          {state === "thinking" && "Thinking..."}
          {state === "searching" && "Searching..."}
          {state === "reading" && "Reading..."}
          {state === "speaking" && "Speaking..."}
          {state === "waiting" && "Awaiting confirmation"}
          {state === "error" && "Error"}
        </span>
      </div>
    </div>
  );
}
