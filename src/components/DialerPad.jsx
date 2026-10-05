import React from 'react';
import { Phone, Delete, PlusCircle } from 'lucide-react';
import { voiceEngine } from '../audio/VoiceEngine';

const DIALPAD_KEYS = [
  { key: '1', sub: ' ' },
  { key: '2', sub: 'A B C' },
  { key: '3', sub: 'D E F' },
  { key: '4', sub: 'G H I' },
  { key: '5', sub: 'J K L' },
  { key: '6', sub: 'M N O' },
  { key: '7', sub: 'P Q R S' },
  { key: '8', sub: 'T U V' },
  { key: '9', sub: 'W X Y Z' },
  { key: '0', sub: ' ' },
];

const CODE_LENGTH = 6;

// Room code pad: type a friend's 6-digit room code and join, or create a new room
export default function DialerPad({
  roomCode,
  onRoomCodeChange,
  onJoinRoom,
  onCreateRoom,
  isCallInProgress = false,
}) {
  const setCode = (value) => onRoomCodeChange(value.replace(/\D/g, '').slice(0, CODE_LENGTH));

  const handleKeyPress = (char) => {
    if (roomCode.length >= CODE_LENGTH) return;
    // Play dual-tone multi-frequency (DTMF) standard tone
    voiceEngine.playDtmfTone(char);
    setCode(roomCode + char);
  };

  const handleBackspace = () => {
    setCode(roomCode.slice(0, -1));
  };

  const isCodeComplete = roomCode.length === CODE_LENGTH;

  return (
    <div className="dialer-pad-wrapper">
      {/* Room Code Display */}
      <div className="phone-input-container">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          className="phone-display-input room-code-input"
          placeholder="Room code"
          value={roomCode}
          onChange={(e) => setCode(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && isCodeComplete && !isCallInProgress) onJoinRoom();
          }}
          aria-label="Room code"
        />
        {roomCode.length > 0 && (
          <button
            type="button"
            className="backspace-btn"
            onClick={handleBackspace}
            title="Delete digit"
          >
            <Delete size={20} />
          </button>
        )}
      </div>

      <p className="room-hint">Enter your friend's 6-digit room code, or create a room and share yours.</p>

      {/* Number Pad */}
      <div className="dial-grid">
        {DIALPAD_KEYS.slice(0, 9).map((item) => (
          <button
            key={item.key}
            type="button"
            className="dial-key"
            onClick={() => handleKeyPress(item.key)}
          >
            <span className="key-number">{item.key}</span>
            <span className="key-sub">{item.sub}</span>
          </button>
        ))}
        <span aria-hidden="true" />
        <button type="button" className="dial-key" onClick={() => handleKeyPress('0')}>
          <span className="key-number">0</span>
          <span className="key-sub">&nbsp;</span>
        </button>
        <span aria-hidden="true" />
      </div>

      {/* Room Actions */}
      <div className="dial-actions room-actions">
        <button
          type="button"
          className="call-btn"
          onClick={onJoinRoom}
          disabled={isCallInProgress || !isCodeComplete}
          aria-label="Join room"
        >
          <div className="call-btn-inner">
            <Phone size={24} className="call-icon" />
          </div>
          <span className="call-label">Join Room</span>
        </button>

        <button
          type="button"
          className="create-room-btn"
          onClick={onCreateRoom}
          disabled={isCallInProgress}
        >
          <PlusCircle size={18} />
          <span>Create Room</span>
        </button>
      </div>
    </div>
  );
}
