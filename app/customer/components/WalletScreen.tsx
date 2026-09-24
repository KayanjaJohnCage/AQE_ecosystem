type Props = {
  currency: string;
  onDeposit: () => void;
  onWithdraw: () => void;
  onRechargeQc: () => void;
  onViewEarnings: () => void;
  qcBalance: number;
  walletBalance: number;
  totalEarnings: number;
  pendingEarnings: number;
  earningsBySource: Record<string, number>;
};

export function WalletScreen({
  currency,
  onDeposit,
  onWithdraw,
  onRechargeQc,
  onViewEarnings,
  qcBalance,
  walletBalance,
  totalEarnings,
  pendingEarnings,
  earningsBySource,
}: Props) {
  return (
    <div className="aqe-wallet-screen">
      <h1>Wallet</h1>
      <p>Your cash wallet, QC balance and the earnings you have generated across AQE.</p>

      <div className="aqe-wallet-grid">
        <article>
          <span>Total earnings</span>
          <strong>{currency} {totalEarnings.toLocaleString()}</strong>
          <small>All credited ecosystem earnings</small>
          <button type="button" onClick={onViewEarnings}>View earnings</button>
        </article>

        <article>
          <span>Available wallet</span>
          <strong>{currency} {walletBalance.toLocaleString()}</strong>
          <div className="aqe-wallet-actions">
            <button type="button" onClick={onDeposit}>Deposit</button>
            <button type="button" onClick={onWithdraw}>Withdraw</button>
          </div>
        </article>

        <article>
          <span>Pending wallet</span>
          <strong>{currency} {pendingEarnings.toLocaleString()}</strong>
          <small>Currently reserved or pending</small>
        </article>

        <article>
          <span>QC balance</span>
          <strong>{qcBalance}</strong>
          <button type="button" onClick={onRechargeQc}>Recharge QC</button>
        </article>
      </div>

      <section className="aqe-ledger">
        <div>
          <strong>Where your earnings came from</strong>
          <button type="button" onClick={onViewEarnings}>View earnings</button>
        </div>
        {Object.keys(earningsBySource).length ? (
          <div className="feature-list">
            {Object.entries(earningsBySource)
              .sort(([, a], [, b]) => b - a)
              .map(([source, amount]) => (
                <div key={source}>
                  <strong>{source}</strong>
                  <span>{currency} {amount.toLocaleString()}</span>
                </div>
              ))}
          </div>
        ) : (
          <p>No earnings have been credited yet.</p>
        )}
      </section>
    </div>
  );
}
