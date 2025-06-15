import { useEffect, useState } from "react";

interface AmazonProduct {
  asin?: string;
  title?: string;
  imageUrl?: string;
  detailPageUrl?: string;
  author?: string;
  brand?: string;
  price?: string;
  priceValue?: number;
}

interface AmazonSearchResult {
  keyword: string;
  products: AmazonProduct[];
  searchedAt: string;
}

interface AmazonAssociateProps {
  date: string;
}

const AmazonAssociate = ({ date }: AmazonAssociateProps) => {
  const [product, setProduct] = useState<AmazonProduct | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setProduct(null);
      try {
        const [y, m, d] = date.split("-");
        const path = `./data/${y}/${m}/${d}.amazon.json`;
        const res = await fetch(path);
        if (!res.ok) return;
        const data = (await res.json()) as AmazonSearchResult[];
        const results = data.filter((r) => r.products && r.products.length > 0);
        if (results.length === 0) return;

        const weights = results.map((r) => r.products.length);
        const total = weights.reduce((a, b) => a + b, 0);
        let r = Math.random() * total;
        let chosen: AmazonSearchResult = results[0];
        for (let i = 0; i < results.length; i++) {
          if (r < weights[i]) {
            chosen = results[i];
            break;
          }
          r -= weights[i];
        }
        const item =
          chosen.products[Math.floor(Math.random() * chosen.products.length)];
        setProduct(item);
      } catch (e) {
        console.error(e);
      }
    };
    if (date) {
      fetchData();
    }
  }, [date]);

  if (!product) return null;

  return (
    <div className="amazon-associate">
      {product.imageUrl && (
        <a href={product.detailPageUrl} target="_blank" rel="noopener noreferrer">
          <img src={product.imageUrl} alt={product.title ?? "Amazon product"} />
        </a>
      )}
      <div className="amazon-associate-details">
        <a href={product.detailPageUrl} target="_blank" rel="noopener noreferrer">
          {product.title}
        </a>
        {product.author && <div className="amazon-associate-author">{product.author}</div>}
        {!product.author && product.brand && (
          <div className="amazon-associate-author">{product.brand}</div>
        )}
        {product.price && (
          <div className="amazon-associate-price">{product.price}</div>
        )}
      </div>
    </div>
  );
};

export default AmazonAssociate;
