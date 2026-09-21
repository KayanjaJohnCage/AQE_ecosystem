type Product = { id: string; title: string; price: number; currency: string; inventory: number };

export function ShopScreen({ products }: { products: Product[] }) {
  return <div className="aqe-shop-screen">
    <div className="aqe-shop-heading"><h1>Marketplace</h1><button type="button" aria-label="Cart"><i className="fas fa-shopping-cart" /></button></div>
    <div className="aqe-shop-grid">{products.map((product, index) => <article key={product.id}>
      <div className={`aqe-shop-cover tone-${index % 4}`}><i className="fas fa-box-open" /></div>
      <div><strong>{product.title}</strong><span>by AQE creator</span><p>{product.currency} {product.price}</p><button type="button">Add to Cart</button></div>
    </article>)}</div>
    {!products.length ? <div className="empty-panel">No marketplace products are live yet.</div> : null}
  </div>;
}
