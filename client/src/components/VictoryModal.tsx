import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Player } from "@12pions/shared";
import "./VictoryModal.css";

interface VictoryModalProps {
  winner: Player | "draw";
  southName: string;
  northName: string;
  you?: Player | null;
  onRematchAi?: () => void;
  onRematchOnline?: () => void;
}

const CONFETTI_COLORS = ["#8c5b4c", "#5a2a26", "#5c4742", "#a5978c", "#c3bbae", "#d4a574"];

function burstConfetti(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  const dpr = window.devicePixelRatio || 1;
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = `${window.innerWidth}px`;
    canvas.style.height = `${window.innerHeight}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  resize();
  window.addEventListener("resize", resize);

  type Particle = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    h: number;
    color: string;
    rot: number;
    vr: number;
    life: number;
  };

  const particles: Particle[] = [];
  const spawn = (count: number) => {
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.35;
    for (let i = 0; i < count; i++) {
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const speed = 4 + Math.random() * 9;
      particles.push({
        x: cx + (Math.random() - 0.5) * 80,
        y: cy,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        w: 6 + Math.random() * 6,
        h: 8 + Math.random() * 10,
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)]!,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        life: 1,
      });
    }
  };

  spawn(70);
  const followUp = window.setTimeout(() => spawn(40), 280);

  let frame = 0;
  let raf = 0;
  const tick = () => {
    frame += 1;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const p of particles) {
      p.vy += 0.18;
      p.vx *= 0.995;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life -= 0.006;
      if (p.life <= 0) continue;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    }
    if (frame < 220) {
      raf = requestAnimationFrame(tick);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  };
  raf = requestAnimationFrame(tick);

  return () => {
    window.clearTimeout(followUp);
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", resize);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  };
}

export default function VictoryModal({
  winner,
  southName,
  northName,
  you = null,
  onRematchAi,
  onRematchOnline,
}: VictoryModalProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const isDraw = winner === "draw";
  const winnerName = winner === "south" ? southName : winner === "north" ? northName : null;
  const youWon = !!you && winner === you;
  const celebrate = youWon || (!you && !isDraw);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !celebrate) return;
    return burstConfetti(canvas);
  }, [celebrate, winner]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  let title = "Partie nulle";
  let subtitle = "Égalité — personne ne l’emporte.";
  if (!isDraw && winnerName) {
    if (youWon) {
      title = "Victoire !";
      subtitle = `Bravo ${winnerName}, tu as gagné cette partie.`;
    } else if (you) {
      title = "Défaite";
      subtitle = `${winnerName} a gagné cette partie.`;
    } else {
      title = `${winnerName} a gagné`;
      subtitle = "Partie terminée.";
    }
  }

  function playAi() {
    if (location.pathname === "/play/ai" && onRematchAi) {
      onRematchAi();
      return;
    }
    navigate("/play/ai");
  }

  function playOnline() {
    if (location.pathname === "/play/online" && onRematchOnline) {
      onRematchOnline();
      return;
    }
    navigate("/play/online");
  }
  function backToHome() {
    navigate("/");
  }

  return (
    <div className="victory" role="dialog" aria-modal="true" aria-labelledby="victory-title">
      <canvas ref={canvasRef} className="victory__confetti" aria-hidden="true" />
      <div className="victory__backdrop" />
      <div className={`victory__card ${celebrate ? "victory__card--win" : ""}`}>
        <p className="victory__eyebrow">{celebrate ? "Partie terminée" : "Fin de partie"}</p>
        <h2 id="victory-title">{title}</h2>
        <p className="victory__subtitle">{subtitle}</p>
        <div className="victory__actions">
          <button type="button" className="btn btn--secondary" onClick={backToHome}>Retour à l'accueil</button>
          <button type="button" className="btn btn--primary" onClick={playAi}>
            Contre l’ordinateur
          </button>
          <button type="button" className="btn btn--secondary" onClick={playOnline}>
            Partie en ligne
          </button>
        </div>
      </div>
    </div>
  );
}
