export default function LayoutAcceso({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-screen items-start justify-center px-4 py-12 sm:items-center">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-widest text-primario">Permisos COFEPRIS</p>
          <p className="text-xs text-texto-suave">
            Permiso sanitario de importación de dispositivos médicos · VUCEM 260211
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
