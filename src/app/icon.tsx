import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#171717",
          borderRadius: 7,
          color: "#ffffff",
          fontSize: 20,
          fontWeight: 700,
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex" }}>D</div>
        <div style={{ display: "flex", width: 14, height: 3, background: "#d97706", marginTop: 2, borderRadius: 2 }} />
      </div>
    ),
    { ...size }
  );
}
