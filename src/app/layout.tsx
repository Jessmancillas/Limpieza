import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Permisos COFEPRIS · VUCEM",
    template: "%s · Permisos COFEPRIS",
  },
  description:
    "Prepara, firma y da seguimiento al Permiso Sanitario de Importación de Dispositivos Médicos con Registro Sanitario (VUCEM 260211).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-MX" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
