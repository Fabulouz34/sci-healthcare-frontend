export type Sep24AnchorConfig = {
  name: string;
  domain: string;
  countries: string[];
  assetCode: string;
  assetIssuer: string;
};

export function parseSep24Anchors(raw: string | undefined): Sep24AnchorConfig[] {
  if (!raw?.trim()) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('NEXT_PUBLIC_SEP24_ANCHORS must be valid JSON.');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('NEXT_PUBLIC_SEP24_ANCHORS must be a JSON array.');
  }

  return parsed.map((value, index) => {
    if (!value || typeof value !== 'object') {
      throw new Error(`SEP-24 anchor ${index + 1} must be an object.`);
    }
    const anchor = value as Record<string, unknown>;
    const { name, domain, assetCode, countries, assetIssuer } = anchor;
    if (typeof name !== 'string' || !name.trim()) {
      throw new Error(`SEP-24 anchor ${index + 1} needs a name.`);
    }
    if (typeof domain !== 'string' || !isDomain(domain)) {
      throw new Error(`SEP-24 anchor ${index + 1} needs a bare HTTPS domain.`);
    }
    if (typeof assetCode !== 'string' || !/^[A-Za-z0-9]{1,12}$/.test(assetCode)) {
      throw new Error(`SEP-24 anchor ${index + 1} has an invalid assetCode.`);
    }
    if (typeof assetIssuer !== 'string' || !/^G[A-Z2-7]{55}$/.test(assetIssuer)) {
      throw new Error(`SEP-24 anchor ${index + 1} needs a valid Stellar assetIssuer.`);
    }
    if (
      !Array.isArray(countries) ||
      countries.length === 0 ||
      countries.some((country) => typeof country !== 'string' || !/^[A-Za-z]{2}$/.test(country))
    ) {
      throw new Error(`SEP-24 anchor ${index + 1} needs ISO two-letter country codes.`);
    }

    return {
      name: name.trim(),
      domain: domain.toLowerCase(),
      countries: [...new Set(countries.map((country: string) => country.toUpperCase()))],
      assetCode: assetCode.toUpperCase(),
      assetIssuer,
    };
  });
}

export function supportsCountry(anchor: Sep24AnchorConfig, country: string): boolean {
  return anchor.countries.includes(country.toUpperCase());
}

export function isAnchorUrl(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  const anchorDomain = domain.toLowerCase();
  return (
    url.protocol === 'https:' &&
    !url.username &&
    !url.password &&
    (host === anchorDomain || host.endsWith(`.${anchorDomain}`))
  );
}

function isDomain(domain: string): boolean {
  if (domain !== domain.trim() || domain.length > 253) return false;
  return domain.split('.').every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
  );
}
