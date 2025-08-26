/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}"],
  theme: {
    extend: {
      transitionTimingFunction: {
        "in-quad": "cubic-bezier(.55, .085, .68, .53)",
        "in-cubic": "cubic-bezier(.550, .055, .675, .19)",
        "in-quart": "cubic-bezier(.895, .03, .685, .22)",
        "in-quint": "cubic-bezier(.755, .05, .855, .06)",
        "in-expo": "cubic-bezier(.95, .05, .795, .035)",
        "in-circ": "cubic-bezier(.6, .04, .98, .335)",

        "out-quad": "cubic-bezier(.25, .46, .45, .94)",
        "out-cubic": "cubic-bezier(.215, .61, .355, 1)",
        "out-quart": "cubic-bezier(.165, .84, .44, 1)",
        "out-quint": "cubic-bezier(.23, 1, .32, 1)",
        "out-expo": "cubic-bezier(.19, 1, .22, 1)",
        "out-circ": "cubic-bezier(.075, .82, .165, 1)",

        "in-out-quad": "cubic-bezier(.455, .03, .515, .955)",
        "in-out-cubic": "cubic-bezier(.645, .045, .355, 1)",
        "in-out-quart": "cubic-bezier(.77, 0, .175, 1)",
        "in-out-quint": "cubic-bezier(.86, 0, .07, 1)",
        "in-out-expo": "cubic-bezier(1, 0, 0, 1)",
        "in-out-circ": "cubic-bezier(.785, .135, .15, .86)",
      },
      screens: {
        "2xl": "90rem",
      },
      fontSize: {
        "6xl": "4rem",
        xxs: "0.64rem",
        h1: [
          "36px",
          { lineHeight: "100%", letterSpacing: "0px", fontWeight: "400" },
        ],
        h2: [
          "16px",
          { lineHeight: "159%", letterSpacing: "0.06em", fontWeight: "400" },
        ],
        h3: [
          "36px",
          { lineHeight: "159%", letterSpacing: "1px", fontWeight: "400" },
        ],
        h4: [
          "20px",
          { lineHeight: "159%", letterSpacing: "0px", fontWeight: "500" },
        ],
        kicker: [
          "14px",
          { lineHeight: "159%", letterSpacing: "1px", fontWeight: "400" },
        ],
        p1: [
          "12px",
          { lineHeight: "175%", letterSpacing: "0.04em", fontWeight: "400" },
        ],
        p2: [
          "12px",
          { lineHeight: "175%", letterSpacing: "0.04em", fontWeight: "400" },
        ],
        p3: [
          "14px",
          { lineHeight: "175%", letterSpacing: "0.04em", fontWeight: "400" },
        ],
        p4: [
          "18px",
          { lineHeight: "159%", letterSpacing: "-0.03em", fontWeight: "400" },
        ],
        footer1: [
          "14px",
          { lineHeight: "normal", letterSpacing: "1px", fontWeight: "400" },
        ],
        footer2: [
          "14px",
          { lineHeight: "normal", letterSpacing: "1px", fontWeight: "400" },
        ],
      },
      colors: {
        orange: "#F66700",
        link: "#0b0080",
        secondaryLight1: "#DDE0E1",
        secondaryLight2: "#A8AFB3",
        secondaryLight4: "#525A60",
      },
      fontFamily: {
        sans: ["Work Sans", "sans-serif"],
        mono: ["Roboto Mono", "monospace"],
      },
      maxWidth: {
        main: "1200px",
        mainWide: "1600px",
      },
    },
  },
  plugins: [],
};
