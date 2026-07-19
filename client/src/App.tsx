import { NavLink, Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import OnlinePage from "./pages/OnlinePage";
import AiPage from "./pages/AiPage";
import LeaderboardPage from "./pages/LeaderboardPage";
import RulesPage from "./pages/RulesPage";

export default function App() {
  return (
    <>
      <nav className="site-nav">
        <NavLink to="/" className="site-nav__brand">
          12 Pions
        </NavLink>
        <div className="site-nav__links">
          <NavLink
            to="/play/online"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            En ligne
          </NavLink>
          <NavLink
            to="/play/ai"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Contre l’ordi
          </NavLink>
          <NavLink
            to="/leaderboard"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Classement
          </NavLink>
          <NavLink
            to="/rules"
            className={({ isActive }) => (isActive ? "active" : undefined)}
          >
            Règles
          </NavLink>
        </div>
      </nav>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/play/online" element={<OnlinePage />} />
        <Route path="/play/ai" element={<AiPage />} />
        <Route path="/leaderboard" element={<LeaderboardPage />} />
        <Route path="/rules" element={<RulesPage />} />
      </Routes>
    </>
  );
}
