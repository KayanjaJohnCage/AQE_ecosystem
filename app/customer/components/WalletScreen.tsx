type Props = {
  currency: string;
  onDeposit: () => void;
  onRechargeQc: () => void;
  onViewEarnings: () => void;
  qcBalance: number;
  walletBalance: number;
};

export function WalletScreen({ currency, onDeposit, onRechargeQc, onViewEarnings, qcBalance, walletBalance }: Props) {
  return <div className="aqe-wallet-screen">
    <h1>Wallet</h1>
    <p>Your unified QC balance, daily chat allowance and complete QC history.</p>
    <div className="aqe-wallet-grid">
      <article><span>Wallet</span><strong>{currency} {walletBalance.toLocaleString()}</strong><button type="button" onClick={onDeposit}>Deposit</button></article>
      <article><span>QC balance</span><strong>{qcBalance}</strong><button type="button" onClick={onRechargeQc}>Recharge QC</button></article>
      <article><span>Chat allowance today</span><strong>0 / 5</strong><small>5 free chat messages daily</small></article>
    </div>
    <section className="aqe-ledger"><div><strong>Recent ledger</strong><button type="button" onClick={onViewEarnings}>View earnings</button></div><p>No QC activity yet.</p></section>
  </div>;
}
