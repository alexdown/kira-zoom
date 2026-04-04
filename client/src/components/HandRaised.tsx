interface HandRaisedProps {
  visible: boolean;
}

export default function HandRaised({ visible }: HandRaisedProps) {
  if (!visible) return null;

  return (
    <div className="hand-raised-container">
      <div className="hand-glow">
        <span className="hand-emoji hand-bounce">✋</span>
      </div>
      <div className="hand-text">Has a question</div>
    </div>
  );
}
