import { ChartNoAxesCombined, CreditCard, Wallet } from "lucide-react";

import { Brand } from "@/components/ui/Brand";
import { ThemeControl } from "@/components/ui/ThemeControl";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <header className="auth-header"><Brand /><ThemeControl /></header>
      <main className="auth-main">
        <section className="auth-intro" aria-label="Sobre o TMS Finance">
          <span className="eyebrow">SUAS FINANÇAS, COM CLAREZA</span>
          <h2>Seu dinheiro.<br />Uma visão completa.</h2>
          <p>Contas, cartões e planos em um só lugar. Mais organização para decidir seus próximos passos.</p>
          <div className="auth-features">
            <span><Wallet size={20} aria-hidden /> Acompanhe suas contas</span>
            <span><CreditCard size={20} aria-hidden /> Organize cartões e faturas</span>
            <span><ChartNoAxesCombined size={20} aria-hidden /> Planeje o que vem pela frente</span>
          </div>
        </section>
        <div className="auth-form">{children}</div>
      </main>
      <footer className="auth-footer">TMS Finance · Organização para o seu dia a dia.</footer>
    </div>
  );
}
