interface AvatarProps {
  avatarUrl: string;
  botName: string;
  speaking: boolean;
}

const DEFAULT_AVATAR_SVG = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#6366f1"/>
      <stop offset="100%" style="stop-color:#8b5cf6"/>
    </linearGradient>
  </defs>
  <circle cx="100" cy="100" r="100" fill="url(#bg)"/>
  <rect x="60" y="55" width="80" height="60" rx="12" fill="#e0e7ff" opacity="0.95"/>
  <circle cx="80" cy="80" r="8" fill="#4f46e5"/>
  <circle cx="120" cy="80" r="8" fill="#4f46e5"/>
  <circle cx="83" cy="77" r="3" fill="white"/>
  <circle cx="123" cy="77" r="3" fill="white"/>
  <rect x="85" y="98" width="30" height="4" rx="2" fill="#4f46e5" opacity="0.6"/>
  <rect x="70" y="40" width="4" height="20" rx="2" fill="#a5b4fc"/>
  <rect x="126" y="40" width="4" height="20" rx="2" fill="#a5b4fc"/>
  <circle cx="72" cy="38" r="5" fill="#a5b4fc"/>
  <circle cx="128" cy="38" r="5" fill="#a5b4fc"/>
  <rect x="75" y="120" width="50" height="35" rx="8" fill="#e0e7ff" opacity="0.85"/>
  <rect x="88" y="130" width="8" height="8" rx="2" fill="#4f46e5" opacity="0.4"/>
  <rect x="104" y="130" width="8" height="8" rx="2" fill="#4f46e5" opacity="0.4"/>
  <rect x="88" y="142" width="24" height="4" rx="2" fill="#4f46e5" opacity="0.3"/>
</svg>
`)}`;

export default function Avatar({ avatarUrl, botName, speaking }: AvatarProps) {
  const src = avatarUrl || DEFAULT_AVATAR_SVG;

  return (
    <div className="avatar-wrapper">
      <div className={`avatar-circle${speaking ? " speaking-pulse" : ""}`}>
        <img src={src} alt={botName} className="avatar-image" />
      </div>
      <div className="avatar-name">{botName}</div>
    </div>
  );
}
