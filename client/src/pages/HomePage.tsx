import { Link } from "react-router-dom";
import "./HomePage.css";

export default function HomePage() {
  return (
    <main className="home">
      <div className="home__atmosphere" aria-hidden="true" />
      <section className="home__hero">
        <p className="home__brand">12 Pions</p>
        <h1 className="home__title">Jeu de plateau</h1>
        <p className="home__lede">
          Affrontez un adversaire en ligne pour augmenter votre classement ou entrainez vous contre l’ordinateur.
        </p>
        <div className="home__ctas">
          <Link className="btn btn--primary" to="/play/online">
            Jouer en ligne
          </Link>
          <Link className="btn btn--secondary" to="/play/ai">
            Contre l’ordi
          </Link>
          <Link className="btn btn--ghost" to="/leaderboard">
            Classement
          </Link>
        </div>
      </section>
    </main>
  );
}
