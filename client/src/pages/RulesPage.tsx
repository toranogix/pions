import "./RulesPage.css";

export default function RulesPage() {
  return (
    <main className="page rules">
      <header className="rules__header">
        <h1>Règles du jeu</h1>
      </header>

      <ol className="rules__list">
        <li>
          <strong>Plateau 5×5.</strong> Chaque camp commence avec 12 pions, la case centrale est libre.
        </li>
        <li>
          <strong>Déplacement.</strong> Un pion avance d’une case vers le camp
          adverse, ou latéralement. Il ne peut pas reculer. Pas de diagonale.
          Vous choisissez librement le pion à jouer — aucune prise n’est forcée.
        </li>
        <li>
          <strong>Capture.</strong> Sautez un pion adverse vers la case libre
          située derrière lui (vers l’avant ou sur le côté, jamais en
          reculant). Les prises en chaîne sont autorisées, sans revenir en
          arrière dans la même chaîne. Vous pouvez terminer une chaîne
          volontairement.
        </li>
        <li>
          <strong>Dame.</strong> Un pion qui atteint la dernière ligne adverse
          est promu. La dame glisse de plusieurs cases en ligne droite (H/V),
          dans toutes les directions — y compris en arrière. Pour capturer, elle
          saute un pion adverse et peut atterrir sur n’importe quelle case libre
          derrière lui, tant que le chemin reste libre.
        </li>
        <li>
          <strong>Victoire.</strong> Capturez tous les pions adverses, ou
          laissez l’adversaire sans coup légal.
        </li>
        <li>
          <strong>Partie nulle.</strong> S’il ne reste qu’un seul pion pour
          chaque camp, la partie est déclarée nulle.
        </li>
      </ol>
    </main>
  );
}
