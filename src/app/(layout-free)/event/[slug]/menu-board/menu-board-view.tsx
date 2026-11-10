import type { CSSProperties } from "react";
import { fitScale, layoutMenu, type BoardMenuItem, type MenuGroup } from "@/lib/cafe/menu-board";
import "./menu-board.css";

// Twilio Sans loads from twilio-fonts.css; these two are only the fallback if it cannot.
const FONTS =
  "https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@500;700;800&family=JetBrains+Mono:wght@700&display=swap";

function Mark({ veg }: { veg: boolean }) {
  return <i className={`mb-mark ${veg ? "mb-mark--veg" : "mb-mark--non"}`} role="img" aria-label={veg ? "Veg" : "Non-veg"} />;
}

function Row({ item, free }: { item: BoardMenuItem; free?: boolean }) {
  return (
    <li className="mb-item">
      <Mark veg={item.veg} />
      <span className="mb-name">{item.title}</span>
      <span className="mb-leader" />
      <b className={`mb-tok${free ? " mb-tok--free" : ""}`}>{free ? "FREE" : `₹${item.price}`}</b>
    </li>
  );
}

function Section({ group }: { group: MenuGroup }) {
  return (
    <div className="mb-sec">
      <h3>
        {group.name}
        {group.price != null && <small>₹{group.price} each</small>}
      </h3>
      <ul>
        {group.items.map((i) => (
          <Row key={i.title} item={i} />
        ))}
      </ul>
    </div>
  );
}

function Panel({ groups }: { groups: MenuGroup[] }) {
  return (
    <section className="mb-panel">
      {groups.map((g) => (
        <Section key={g.name} group={g} />
      ))}
    </section>
  );
}

function Scan({ qrSvg }: { qrSvg: string }) {
  return (
    <div className="mb-scan">
      <div className="mb-qr" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <div>
        <b>Scan to order</b>
        <span>Opens WhatsApp. Pay with UPI or card.</span>
      </div>
    </div>
  );
}

/** The menu as a sign for a display: free coffees, then the paid groups in two panels. */
export function MenuBoardView({ items, qrSvg }: { items: BoardMenuItem[]; qrSvg: string | null }) {
  const layout = layoutMenu(items);
  const vars = {
    "--k-land": fitScale(layout, "landscape"),
    "--k-port": fitScale(layout, "portrait"),
  } as CSSProperties;
  const empty = items.length === 0;

  return (
    <div className="mb-root" style={vars}>
      <link rel="stylesheet" href={FONTS} precedence="default" />
      <header className="mb-bar">
        <div className="mb-brand">
          Builder&apos;s Cafe <small>MENU</small>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mb-logo" src="/twilio.svg" alt="Twilio" />
      </header>
      {empty ? (
        <main className="mb-panels mb-panels--empty">
          <div className="mb-notice">The menu is being set up.</div>
        </main>
      ) : (
        <main className="mb-panels">
          <section className="mb-panel mb-panel--free">
            {layout.free.length > 0 ? (
              <>
                <div className="mb-crest">
                  <div className="mb-eyebrow">For quiz winners</div>
                  <h2>Free coffee</h2>
                </div>
                <div className="mb-sec">
                  <h3>
                    Pick any one<small>1 per person</small>
                  </h3>
                  <ul className="mb-free-list">
                    {layout.free.map((i) => (
                      <Row key={i.title} item={i} free />
                    ))}
                  </ul>
                </div>
                <p className="mb-how">Get all 3 quiz answers right on WhatsApp. While free coffees last.</p>
              </>
            ) : (
              <div className="mb-crest">
                <div className="mb-eyebrow">Order on WhatsApp</div>
                <h2>Scan to order</h2>
              </div>
            )}
            {qrSvg && <Scan qrSvg={qrSvg} />}
          </section>
          {layout.columns.map((groups, n) => (groups.length > 0 ? <Panel key={n} groups={groups} /> : null))}
        </main>
      )}
      <footer className="mb-foot">
        <div className="mb-legend">
          <span>
            <Mark veg /> Veg
          </span>
          <span>
            <Mark veg={false} /> Non-veg
          </span>
        </div>
        <div>Your order number appears on the order board</div>
      </footer>
    </div>
  );
}
