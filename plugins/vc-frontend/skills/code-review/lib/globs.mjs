// Glob matching for zones, token sources and path-scoped rules: `*`, `?`, `**/`, `{a,b}`.

const compiled = new Map();

export function globMatch(glob, p) {
  let re = compiled.get(glob);
  if (!re) {
    re = globToRegExp(glob);
    compiled.set(glob, re);
  }
  return re.test(p);
}

export function globToRegExp(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") {
      i++;
      if (glob[i + 1] === "/") {
        i++;
        re += "(?:.*/)?";
      } else re += ".*";
    } else if (c === "*") re += "[^/]*";
    else if (c === "?") re += "[^/]";
    else if (c === "{") {
      const end = glob.indexOf("}", i);
      re += "(?:" + glob.slice(i + 1, end).split(",").map(escapeRe).join("|") + ")";
      i = end;
    } else re += escapeRe(c);
  }
  return new RegExp("^" + re + "$");
}

export function escapeRe(s) {
  return s.replace(/[.+^$()|[\]\\]/g, "\\$&");
}
