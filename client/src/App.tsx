import { useMemo } from "react";
import { useServerWS } from "./hooks/useServerWS";
import Avatar from "./components/Avatar";
import HandRaised from "./components/HandRaised";
import Speaking from "./components/Speaking";
import StatusBar from "./components/StatusBar";

export type BotState =
  | "JOINING"
  | "LISTENING"
  | "HAND_RAISED"
  | "SPEAKING"
  | "DONE"
  | "ERROR";

const STATUS_TEXT: Record<BotState, string> = {
  JOINING: "Joining...",
  LISTENING: "Listening",
  HAND_RAISED: "Hand Raised ✋",
  SPEAKING: "Speaking 🎤",
  DONE: "Done",
  ERROR: "Error",
};

function getParams(): { sessionId: string; avatar: string; botName: string } {
  const params = new URLSearchParams(window.location.search);
  return {
    sessionId: params.get("sessionId") ?? "",
    avatar: params.get("avatar") ?? "",
    botName: params.get("botName") ?? "AI Assistant",
  };
}

export default function App() {
  const { sessionId, avatar, botName } = useMemo(getParams, []);
  const { state, connected } = useServerWS(sessionId);

  const botState: BotState = (state as BotState) || "JOINING";
  const statusText = STATUS_TEXT[botState] ?? botState;

  return (
    <div className="app-container">
      <div className="avatar-stage">
        <Avatar
          avatarUrl={avatar}
          botName={botName}
          speaking={botState === "SPEAKING"}
        />

        <div className={`overlay-layer ${botState === "HAND_RAISED" ? "fade-in" : "fade-out"}`}>
          <HandRaised visible={botState === "HAND_RAISED"} />
        </div>

        <div className={`overlay-layer ${botState === "SPEAKING" ? "fade-in" : "fade-out"}`}>
          <Speaking visible={botState === "SPEAKING"} />
        </div>
      </div>

      <StatusBar
        botName={botName}
        statusText={statusText}
        connected={connected}
      />
    </div>
  );
}
