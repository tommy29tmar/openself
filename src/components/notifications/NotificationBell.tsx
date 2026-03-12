"use client";

import { forwardRef, type CSSProperties } from "react";

interface NotificationBellProps {
  count: number;
  onClick: () => void;
}

export const NotificationBell = forwardRef<HTMLButtonElement, NotificationBellProps>(
  function NotificationBell({ count, onClick }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        aria-label={count > 0 ? `${count} notifications` : "Notifications"}
        style={bellStyle}
      >
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M10 2C7.24 2 5 4.24 5 7V10.5L3.5 13V14H16.5V13L15 10.5V7C15 4.24 12.76 2 10 2Z"
            fill="currentColor"
            opacity="0.85"
          />
          <path d="M8.5 15C8.5 15.83 9.17 16.5 10 16.5C10.83 16.5 11.5 15.83 11.5 15H8.5Z" fill="currentColor" />
        </svg>

        {count > 0 && (
          <span style={badgeStyle}>
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
    );
  }
);

const bellStyle: CSSProperties = {
  position: "relative",
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "rgba(255,255,255,0.7)",
  padding: "8px",
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  transition: "color 0.15s, background 0.15s",
};

const badgeStyle: CSSProperties = {
  position: "absolute",
  top: 2,
  right: 2,
  background: "#e53e3e",
  color: "#fff",
  fontSize: 10,
  fontWeight: 700,
  minWidth: 16,
  height: 16,
  borderRadius: 8,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 4px",
  lineHeight: 1,
};
