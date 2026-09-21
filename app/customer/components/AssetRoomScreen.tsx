"use client";

type Props = {
  currency: string;
  onUpgrade: () => void;
  tier: string;
  walletBalance: number;
};

export function AssetRoomScreen({
  currency,
  onUpgrade,
  tier,
  walletBalance,
}: Props) {
  const unlocked = tier === "vip";

  return (
    <div className="prototype-screen-stack">
      <article className="asset-room-hero">
        <span className="asset-room-lock" aria-hidden="true">LOCKED</span>
        <span className="eyebrow">PRIVATE ASSET ROOM</span>
        <h2>Your AQE vault</h2>
        <p>
          A private overview of wallet cash, savings, and escrow. Financial
          actions remain verified on the server.
        </p>
        {unlocked ? (
          <strong>
            {currency} {walletBalance.toLocaleString()}
          </strong>
        ) : (
          <button type="button" onClick={onUpgrade}>
            Upgrade to unlock Asset Room
          </button>
        )}
      </article>

      {unlocked ? (
        <>
          <div className="asset-room-balance-grid">
            <div>
              <span>Wallet</span>
              <strong>
                {currency} {walletBalance.toLocaleString()}
              </strong>
            </div>
            <div>
              <span>Savings</span>
              <strong>{currency} 0</strong>
            </div>
            <div>
              <span>Escrow</span>
              <strong>{currency} 0</strong>
            </div>
          </div>
          <div className="feature-list">
            <div>
              <strong>Savings vaults</strong>
              <span>
                Savings vaults will appear here once server-backed vault
                records are available.
              </span>
            </div>
            <div>
              <strong>Asset allocation</strong>
              <span>
                Current confirmed wallet cash: {currency}{" "}
                {walletBalance.toLocaleString()}.
              </span>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
