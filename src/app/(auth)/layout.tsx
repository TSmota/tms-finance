import { ChartNoAxesCombined, CreditCard, Wallet } from "lucide-react";

import { Brand } from "@/components/ui/Brand";
import { ThemeControl } from "@/components/ui/ThemeControl";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-layout">
      <header className="auth-header"><Brand /><ThemeControl /></header>
      <main className="auth-main">
        <section className="auth-intro" aria-label="Sobre o TMS Finance">
          <span className="eyebrow">GESTÃO FINANCEIRA PESSOAL</span>
          <h2>Controle financeiro com rigor contábil.</h2>
          <p>
            Gestão multimoeda, acompanhamento ciclo a ciclo de faturas de cartão e
            projeção precisa do seu fluxo de caixa.
          </p>
          <div className="auth-features">
            <span><Wallet size={20} aria-hidden /> Saldos multimoeda com conversão diária</span>
            <span><CreditCard size={20} aria-hidden /> Ciclos de fatura, limites e parcelamentos</span>
            <span><ChartNoAxesCombined size={20} aria-hidden /> Projeção de saldo futuro e conciliação real</span>
          </div>
        </section>
        <div className="auth-form">{children}</div>
      </main>
      <footer className="auth-footer">TMS Finance · Sistema pessoal de conciliação e fluxo de caixa.</footer>
    </div>
  );
}
