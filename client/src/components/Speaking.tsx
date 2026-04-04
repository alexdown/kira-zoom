interface SpeakingProps {
  visible: boolean;
}

export default function Speaking({ visible }: SpeakingProps) {
  if (!visible) return null;

  return (
    <div className="speaking-container">
      <div className="waveform">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="waveform-bar"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
      <div className="speaking-text">Speaking...</div>
    </div>
  );
}
