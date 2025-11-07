var __defProp = Object.defineProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// deno:https://jsr.io/@std/text/1.0.15/levenshtein_distance.ts
var { ceil } = Math;
var peq = new Uint32Array(1114112);
function myers32(t, p) {
  const n = t.length;
  const m = p.length;
  for (let i = 0; i < m; i++) {
    peq[p[i].codePointAt(0)] |= 1 << i;
  }
  const last = m - 1;
  let pv = -1;
  let mv = 0;
  let score = m;
  for (let j = 0; j < n; j++) {
    const eq = peq[t[j].codePointAt(0)];
    const xv = eq | mv;
    const xh = (eq & pv) + pv ^ pv | eq;
    let ph = mv | ~(xh | pv);
    let mh = pv & xh;
    score += (ph >>> last & 1) - (mh >>> last & 1);
    ph = ph << 1 | 1;
    mh = mh << 1;
    pv = mh | ~(xv | ph);
    mv = ph & xv;
  }
  for (let i = 0; i < m; i++) {
    peq[p[i].codePointAt(0)] = 0;
  }
  return score;
}
function myersX(t, p) {
  const n = t.length;
  const m = p.length;
  const h = new Int8Array(n).fill(1);
  const bmax = ceil(m / 32) - 1;
  for (let b = 0; b < bmax; b++) {
    const start2 = b * 32;
    const end = (b + 1) * 32;
    for (let i = start2; i < end; i++) {
      peq[p[i].codePointAt(0)] |= 1 << i;
    }
    let pv2 = -1;
    let mv2 = 0;
    for (let j = 0; j < n; j++) {
      const hin = h[j];
      let eq = peq[t[j].codePointAt(0)];
      const xv = eq | mv2;
      eq |= hin >>> 31;
      const xh = (eq & pv2) + pv2 ^ pv2 | eq;
      let ph = mv2 | ~(xh | pv2);
      let mh = pv2 & xh;
      h[j] = (ph >>> 31) - (mh >>> 31);
      ph = ph << 1 | -hin >>> 31;
      mh = mh << 1 | hin >>> 31;
      pv2 = mh | ~(xv | ph);
      mv2 = ph & xv;
    }
    for (let i = start2; i < end; i++) {
      peq[p[i].codePointAt(0)] = 0;
    }
  }
  const start = bmax * 32;
  for (let i = start; i < m; i++) {
    peq[p[i].codePointAt(0)] |= 1 << i;
  }
  const last = m - 1;
  let pv = -1;
  let mv = 0;
  let score = m;
  for (let j = 0; j < n; j++) {
    const hin = h[j];
    let eq = peq[t[j].codePointAt(0)];
    const xv = eq | mv;
    eq |= hin >>> 31;
    const xh = (eq & pv) + pv ^ pv | eq;
    let ph = mv | ~(xh | pv);
    let mh = pv & xh;
    score += (ph >>> last & 1) - (mh >>> last & 1);
    ph = ph << 1 | -hin >>> 31;
    mh = mh << 1 | hin >>> 31;
    pv = mh | ~(xv | ph);
    mv = ph & xv;
  }
  for (let i = start; i < m; i++) {
    peq[p[i].codePointAt(0)] = 0;
  }
  return score;
}
function levenshteinDistance(str1, str2) {
  let t = [
    ...str1
  ];
  let p = [
    ...str2
  ];
  if (t.length < p.length) {
    [p, t] = [
      t,
      p
    ];
  }
  if (p.length === 0) {
    return t.length;
  }
  return p.length <= 32 ? myers32(t, p) : myersX(t, p);
}

// deno:https://jsr.io/@std/text/1.0.15/closest_string.ts
function closestString(givenWord, possibleWords, options) {
  if (possibleWords.length === 0) {
    throw new TypeError("When using closestString(), the possibleWords array must contain at least one word");
  }
  const { caseSensitive, compareFn = levenshteinDistance } = {
    ...options
  };
  if (!caseSensitive) {
    givenWord = givenWord.toLowerCase();
  }
  let nearestWord = possibleWords[0];
  let closestStringDistance = Infinity;
  for (const each of possibleWords) {
    const distance = caseSensitive ? compareFn(givenWord, each) : compareFn(givenWord, each.toLowerCase());
    if (distance < closestStringDistance) {
      nearestWord = each;
      closestStringDistance = distance;
    }
  }
  return nearestWord;
}

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/_utils.ts
function paramCaseToCamelCase(str2) {
  return str2.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
}
function getOption(flags, name) {
  while (name[0] === "-") {
    name = name.slice(1);
  }
  for (const flag of flags) {
    if (isOption(flag, name)) {
      return flag;
    }
  }
  return;
}
function didYouMeanOption(option, options) {
  const optionNames = options.map((option2) => [
    option2.name,
    ...option2.aliases ?? []
  ]).flat().map((option2) => getFlag(option2));
  return didYouMean(" Did you mean option", getFlag(option), optionNames);
}
function didYouMeanType(type, types) {
  return didYouMean(" Did you mean type", type, types);
}
function didYouMean(message, type, types) {
  const match = types.length ? closestString(type, types) : void 0;
  return match ? `${message} "${match}"?` : "";
}
function getFlag(name) {
  if (name.startsWith("-")) {
    return name;
  }
  if (name.length > 1) {
    return `--${name}`;
  }
  return `-${name}`;
}
function isOption(option, name) {
  return option.name === name || option.aliases && option.aliases.indexOf(name) !== -1;
}
function matchWildCardOptions(name, flags) {
  for (const option of flags) {
    if (option.name.indexOf("*") === -1) {
      continue;
    }
    let matched = matchWildCardOption(name, option);
    if (matched) {
      matched = {
        ...matched,
        name
      };
      flags.push(matched);
      return matched;
    }
  }
}
function matchWildCardOption(name, option) {
  const parts = option.name.split(".");
  const parts2 = name.split(".");
  if (parts.length !== parts2.length) {
    return false;
  }
  const count = Math.max(parts.length, parts2.length);
  for (let i = 0; i < count; i++) {
    if (parts[i] !== parts2[i] && parts[i] !== "*") {
      return false;
    }
  }
  return option;
}
function getDefaultValue(option) {
  return typeof option.default === "function" ? option.default() : option.default;
}

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/_errors.ts
var FlagsError = class _FlagsError extends Error {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, _FlagsError.prototype);
  }
};
var UnknownRequiredOptionError = class _UnknownRequiredOptionError extends FlagsError {
  constructor(option, options) {
    super(`Unknown required option "${getFlag(option)}".${didYouMeanOption(option, options)}`);
    Object.setPrototypeOf(this, _UnknownRequiredOptionError.prototype);
  }
};
var UnknownConflictingOptionError = class _UnknownConflictingOptionError extends FlagsError {
  constructor(option, options) {
    super(`Unknown conflicting option "${getFlag(option)}".${didYouMeanOption(option, options)}`);
    Object.setPrototypeOf(this, _UnknownConflictingOptionError.prototype);
  }
};
var UnknownTypeError = class _UnknownTypeError extends FlagsError {
  constructor(type, types) {
    super(`Unknown type "${type}".${didYouMeanType(type, types)}`);
    Object.setPrototypeOf(this, _UnknownTypeError.prototype);
  }
};
var ValidationError = class _ValidationError extends FlagsError {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, _ValidationError.prototype);
  }
};
var DuplicateOptionError = class _DuplicateOptionError extends ValidationError {
  constructor(name) {
    super(`Option "${getFlag(name).replace(/^--no-/, "--")}" can only occur once, but was found several times.`);
    Object.setPrototypeOf(this, _DuplicateOptionError.prototype);
  }
};
var InvalidOptionError = class _InvalidOptionError extends ValidationError {
  constructor(option, options) {
    super(`Invalid option "${getFlag(option)}".${didYouMeanOption(option, options)}`);
    Object.setPrototypeOf(this, _InvalidOptionError.prototype);
  }
};
var UnknownOptionError = class _UnknownOptionError extends ValidationError {
  constructor(option, options) {
    super(`Unknown option "${getFlag(option)}".${didYouMeanOption(option, options)}`);
    Object.setPrototypeOf(this, _UnknownOptionError.prototype);
  }
};
var MissingOptionValueError = class _MissingOptionValueError extends ValidationError {
  constructor(option) {
    super(`Missing value for option "${getFlag(option)}".`);
    Object.setPrototypeOf(this, _MissingOptionValueError.prototype);
  }
};
var InvalidOptionValueError = class _InvalidOptionValueError extends ValidationError {
  constructor(option, expected, value) {
    super(`Option "${getFlag(option)}" must be of type "${expected}", but got "${value}".`);
    Object.setPrototypeOf(this, _InvalidOptionValueError.prototype);
  }
};
var UnexpectedOptionValueError = class extends ValidationError {
  constructor(option, value) {
    super(`Option "${getFlag(option)}" doesn't take a value, but got "${value}".`);
    Object.setPrototypeOf(this, InvalidOptionValueError.prototype);
  }
};
var OptionNotCombinableError = class _OptionNotCombinableError extends ValidationError {
  constructor(option) {
    super(`Option "${getFlag(option)}" cannot be combined with other options.`);
    Object.setPrototypeOf(this, _OptionNotCombinableError.prototype);
  }
};
var ConflictingOptionError = class _ConflictingOptionError extends ValidationError {
  constructor(option, conflictingOption) {
    super(`Option "${getFlag(option)}" conflicts with option "${getFlag(conflictingOption)}".`);
    Object.setPrototypeOf(this, _ConflictingOptionError.prototype);
  }
};
var DependingOptionError = class _DependingOptionError extends ValidationError {
  constructor(option, dependingOption) {
    super(`Option "${getFlag(option)}" depends on option "${getFlag(dependingOption)}".`);
    Object.setPrototypeOf(this, _DependingOptionError.prototype);
  }
};
var MissingRequiredOptionError = class _MissingRequiredOptionError extends ValidationError {
  constructor(option) {
    super(`Missing required option "${getFlag(option)}".`);
    Object.setPrototypeOf(this, _MissingRequiredOptionError.prototype);
  }
};
var UnexpectedRequiredArgumentError = class _UnexpectedRequiredArgumentError extends ValidationError {
  constructor(arg) {
    super(`An required argument cannot follow an optional argument, but "${arg}"  is defined as required.`);
    Object.setPrototypeOf(this, _UnexpectedRequiredArgumentError.prototype);
  }
};
var UnexpectedArgumentAfterVariadicArgumentError = class _UnexpectedArgumentAfterVariadicArgumentError extends ValidationError {
  constructor(arg) {
    super(`An argument cannot follow an variadic argument, but got "${arg}".`);
    Object.setPrototypeOf(this, _UnexpectedArgumentAfterVariadicArgumentError.prototype);
  }
};
var InvalidTypeError = class extends ValidationError {
  constructor({ label, name, value, type }, expected) {
    super(`${label} "${name}" must be of type "${type}", but got "${value}".` + (expected ? ` Expected values: ${expected.map((value2) => `"${value2}"`).join(", ")}` : ""));
    Object.setPrototypeOf(this, MissingOptionValueError.prototype);
  }
};

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/deprecated.ts
var OptionType = /* @__PURE__ */ function(OptionType2) {
  OptionType2["STRING"] = "string";
  OptionType2["NUMBER"] = "number";
  OptionType2["INTEGER"] = "integer";
  OptionType2["BOOLEAN"] = "boolean";
  return OptionType2;
}({});

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/types/boolean.ts
var boolean = (type) => {
  if (~[
    "1",
    "true"
  ].indexOf(type.value)) {
    return true;
  }
  if (~[
    "0",
    "false"
  ].indexOf(type.value)) {
    return false;
  }
  throw new InvalidTypeError(type, [
    "true",
    "false",
    "1",
    "0"
  ]);
};

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/types/number.ts
var number = (type) => {
  const value = Number(type.value);
  if (Number.isFinite(value)) {
    return value;
  }
  throw new InvalidTypeError(type);
};

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/types/string.ts
var string = ({ value }) => {
  return value;
};

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/_validate_flags.ts
function validateFlags(ctx, opts, options = /* @__PURE__ */ new Map()) {
  if (!opts.flags) {
    return;
  }
  setDefaultValues(ctx, opts);
  const optionNames = Object.keys(ctx.flags);
  if (!optionNames.length && opts.allowEmpty) {
    return;
  }
  if (ctx.standalone) {
    validateStandaloneOption(ctx, options, optionNames);
    return;
  }
  for (const [name, option] of options) {
    validateUnknownOption(option, opts);
    validateConflictingOptions(ctx, option);
    validateDependingOptions(ctx, option);
    validateRequiredValues(ctx, option, name);
  }
  validateRequiredOptions(ctx, options, opts);
}
function validateUnknownOption(option, opts) {
  if (!getOption(opts.flags ?? [], option.name)) {
    throw new UnknownOptionError(option.name, opts.flags ?? []);
  }
}
function setDefaultValues(ctx, opts) {
  if (!opts.flags?.length) {
    return;
  }
  for (const option of opts.flags) {
    let name;
    let defaultValue = void 0;
    if (option.name.startsWith("no-")) {
      const propName = option.name.replace(/^no-/, "");
      if (typeof ctx.flags[propName] !== "undefined") {
        continue;
      }
      const positiveOption = getOption(opts.flags, propName);
      if (positiveOption) {
        continue;
      }
      name = paramCaseToCamelCase(propName);
      defaultValue = true;
    }
    if (!name) {
      name = paramCaseToCamelCase(option.name);
    }
    const hasDefaultValue = (!opts.ignoreDefaults || typeof opts.ignoreDefaults[name] === "undefined") && typeof ctx.flags[name] === "undefined" && (typeof option.default !== "undefined" || typeof defaultValue !== "undefined");
    if (hasDefaultValue) {
      ctx.flags[name] = getDefaultValue(option) ?? defaultValue;
      ctx.defaults[option.name] = true;
      if (typeof option.value === "function") {
        ctx.flags[name] = option.value(ctx.flags[name]);
      }
    }
  }
}
function validateStandaloneOption(ctx, options, optionNames) {
  if (!ctx.standalone || optionNames.length === 1) {
    return;
  }
  for (const [_, opt] of options) {
    if (!ctx.defaults[opt.name] && opt !== ctx.standalone) {
      throw new OptionNotCombinableError(ctx.standalone.name);
    }
  }
}
function validateConflictingOptions(ctx, option) {
  if (!option.conflicts?.length) {
    return;
  }
  for (const flag of option.conflicts) {
    if (isset(flag, ctx.flags)) {
      throw new ConflictingOptionError(option.name, flag);
    }
  }
}
function validateDependingOptions(ctx, option) {
  if (!option.depends) {
    return;
  }
  for (const flag of option.depends) {
    if (!isset(flag, ctx.flags) && !ctx.defaults[option.name]) {
      throw new DependingOptionError(option.name, flag);
    }
  }
}
function validateRequiredValues(ctx, option, name) {
  if (!option.args) {
    return;
  }
  const isArray = option.args.length > 1;
  for (let i = 0; i < option.args.length; i++) {
    const arg = option.args[i];
    if (arg.optional) {
      continue;
    }
    const hasValue = isArray ? typeof ctx.flags[name][i] !== "undefined" : typeof ctx.flags[name] !== "undefined";
    if (!hasValue) {
      throw new MissingOptionValueError(option.name);
    }
  }
}
function validateRequiredOptions(ctx, options, opts) {
  if (!opts.flags?.length) {
    return;
  }
  const optionsValues = [
    ...options.values()
  ];
  for (const option of opts.flags) {
    if (!option.required || paramCaseToCamelCase(option.name) in ctx.flags) {
      continue;
    }
    const conflicts = option.conflicts ?? [];
    const hasConflict = conflicts.find((flag) => !!ctx.flags[flag]);
    const hasConflicts = hasConflict || optionsValues.find((opt) => opt.conflicts?.find((flag) => flag === option.name));
    if (hasConflicts) {
      continue;
    }
    throw new MissingRequiredOptionError(option.name);
  }
}
function isset(flagName, flags) {
  const name = paramCaseToCamelCase(flagName);
  return typeof flags[name] !== "undefined";
}

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/types/integer.ts
var integer = (type) => {
  const value = Number(type.value);
  if (Number.isInteger(value)) {
    return value;
  }
  throw new InvalidTypeError(type);
};

// deno:https://jsr.io/@cliffy/flags/1.0.0-rc.8/flags.ts
var DefaultTypes = {
  string,
  number,
  integer,
  boolean
};
function parseFlags(argsOrCtx, opts = {}) {
  let args;
  let ctx;
  if (Array.isArray(argsOrCtx)) {
    ctx = {};
    args = argsOrCtx;
  } else {
    ctx = argsOrCtx;
    args = argsOrCtx.unknown;
    argsOrCtx.unknown = [];
  }
  args = args.slice();
  ctx.flags ??= {};
  ctx.literal ??= [];
  ctx.unknown ??= [];
  ctx.stopEarly = false;
  ctx.stopOnUnknown = false;
  ctx.defaults ??= {};
  opts.dotted ??= true;
  validateOptions(opts);
  const options = parseArgs(ctx, args, opts);
  validateFlags(ctx, opts, options);
  if (opts.dotted) {
    parseDottedOptions(ctx);
  }
  return ctx;
}
function validateOptions(opts) {
  opts.flags?.forEach((opt) => {
    opt.depends?.forEach((flag) => {
      if (!opts.flags || !getOption(opts.flags, flag)) {
        throw new UnknownRequiredOptionError(flag, opts.flags ?? []);
      }
    });
    opt.conflicts?.forEach((flag) => {
      if (!opts.flags || !getOption(opts.flags, flag)) {
        throw new UnknownConflictingOptionError(flag, opts.flags ?? []);
      }
    });
  });
}
function parseArgs(ctx, args, opts) {
  const optionsMap = /* @__PURE__ */ new Map();
  let inLiteral = false;
  for (let argsIndex = 0; argsIndex < args.length; argsIndex++) {
    let parseNext = function(option2) {
      if (negate) {
        setFlagValue(false);
        return;
      } else if (!option2.args?.length) {
        setFlagValue(void 0);
        return;
      }
      const arg = option2.args[optionArgsIndex];
      if (!arg) {
        const flag = next();
        throw new UnknownOptionError(flag, opts.flags ?? []);
      }
      if (!arg.type) {
        arg.type = OptionType.BOOLEAN;
      }
      if (!option2.args?.length && arg.type === OptionType.BOOLEAN && arg.optional === void 0) {
        arg.optional = true;
      }
      if (arg.optional) {
        inOptionalArg = true;
      } else if (inOptionalArg) {
        throw new UnexpectedRequiredArgumentError(option2.name);
      }
      let result;
      let increase = false;
      if (arg.list && hasNext(arg)) {
        const parsed = next().split(arg.separator || ",").map((nextValue) => {
          const value = parseValue(option2, arg, nextValue);
          if (typeof value === "undefined") {
            throw new InvalidOptionValueError(option2.name, arg.type ?? "?", nextValue);
          }
          return value;
        });
        if (parsed?.length) {
          result = parsed;
        }
      } else {
        if (hasNext(arg)) {
          result = parseValue(option2, arg, next());
        } else if (arg.optional && arg.type === OptionType.BOOLEAN) {
          result = true;
        }
      }
      if (increase && typeof currentValue === "undefined") {
        argsIndex++;
        if (!arg.variadic) {
          optionArgsIndex++;
        } else if (option2.args[optionArgsIndex + 1]) {
          throw new UnexpectedArgumentAfterVariadicArgumentError(next());
        }
      }
      if (typeof result !== "undefined" && (option2.args.length > 1 || arg.variadic)) {
        if (!ctx.flags[propName]) {
          setFlagValue([]);
        }
        ctx.flags[propName].push(result);
        if (hasNext(arg)) {
          parseNext(option2);
        }
      } else {
        setFlagValue(result);
      }
      function hasNext(arg2) {
        if (!option2.args?.length) {
          return false;
        }
        const nextValue = currentValue ?? args[argsIndex + 1];
        if (!nextValue) {
          return false;
        }
        if (option2.args.length > 1 && optionArgsIndex >= option2.args.length) {
          return false;
        }
        if (!arg2.optional) {
          return true;
        }
        if (option2.equalsSign && arg2.optional && !arg2.variadic && typeof currentValue === "undefined") {
          return false;
        }
        if (arg2.optional || arg2.variadic) {
          return nextValue[0] !== "-" || typeof currentValue !== "undefined" || arg2.type === OptionType.NUMBER && !isNaN(Number(nextValue));
        }
        return false;
      }
      function parseValue(option3, arg2, value) {
        const result2 = opts.parse ? opts.parse({
          label: "Option",
          type: arg2.type || OptionType.STRING,
          name: `--${option3.name}`,
          value
        }) : parseDefaultType(option3, arg2, value);
        if (typeof result2 !== "undefined") {
          increase = true;
        }
        return result2;
      }
    }, setFlagValue = function(value) {
      ctx.flags[propName] = value;
      if (ctx.defaults[propName]) {
        delete ctx.defaults[propName];
      }
    };
    let option;
    let current = args[argsIndex];
    let currentValue;
    let negate = false;
    if (inLiteral) {
      ctx.literal.push(current);
      continue;
    } else if (current === "--") {
      inLiteral = true;
      continue;
    } else if (ctx.stopEarly || ctx.stopOnUnknown) {
      ctx.unknown.push(current);
      continue;
    }
    const isFlag = current.length > 1 && current[0] === "-";
    if (!isFlag) {
      if (opts.stopEarly) {
        ctx.stopEarly = true;
      }
      ctx.unknown.push(current);
      continue;
    }
    const isShort = current[1] !== "-";
    const isLong = isShort ? false : current.length > 3 && current[2] !== "-";
    if (!isShort && !isLong) {
      throw new InvalidOptionError(current, opts.flags ?? []);
    }
    if (isShort && current.length > 2 && current[2] !== ".") {
      args.splice(argsIndex, 1, ...splitFlags(current));
      current = args[argsIndex];
    } else if (isLong && current.startsWith("--no-")) {
      negate = true;
    }
    const equalSignIndex = current.indexOf("=");
    if (equalSignIndex !== -1) {
      currentValue = current.slice(equalSignIndex + 1) || void 0;
      current = current.slice(0, equalSignIndex);
    }
    if (opts.flags) {
      option = getOption(opts.flags, current);
      if (!option) {
        const name = current.replace(/^-+/, "");
        option = matchWildCardOptions(name, opts.flags);
        if (!option) {
          if (opts.stopOnUnknown) {
            ctx.stopOnUnknown = true;
            ctx.unknown.push(args[argsIndex]);
            continue;
          }
          throw new UnknownOptionError(current, opts.flags);
        }
      }
    } else {
      option = {
        name: current.replace(/^-+/, ""),
        optionalValue: true,
        type: OptionType.STRING
      };
    }
    if (option.standalone) {
      ctx.standalone = option;
    }
    const positiveName = negate ? option.name.replace(/^no-?/, "") : option.name;
    const propName = paramCaseToCamelCase(positiveName);
    if (typeof ctx.flags[propName] !== "undefined") {
      if (!opts.flags?.length) {
        option.collect = true;
      } else if (!option.collect && !ctx.defaults[option.name]) {
        throw new DuplicateOptionError(current);
      }
    }
    if (option.type && !option.args?.length) {
      option.args = [
        {
          type: option.type,
          optional: option.optionalValue,
          variadic: option.variadic,
          list: option.list,
          separator: option.separator
        }
      ];
    }
    if (opts.flags?.length && !option.args?.length && typeof currentValue !== "undefined") {
      throw new UnexpectedOptionValueError(option.name, currentValue);
    }
    let optionArgsIndex = 0;
    let inOptionalArg = false;
    const next = () => currentValue ?? args[argsIndex + 1];
    const previous = ctx.flags[propName];
    parseNext(option);
    if (typeof ctx.flags[propName] === "undefined") {
      if (option.args?.length && !option.args?.[optionArgsIndex].optional) {
        throw new MissingOptionValueError(option.name);
      } else if (typeof option.default !== "undefined" && (option.type || option.value || option.args?.length)) {
        ctx.flags[propName] = getDefaultValue(option);
      } else {
        setFlagValue(true);
      }
    }
    if (option.value) {
      const value = option.value(ctx.flags[propName], previous);
      setFlagValue(value);
    } else if (option.collect) {
      const value = typeof previous !== "undefined" ? Array.isArray(previous) ? previous : [
        previous
      ] : [];
      value.push(ctx.flags[propName]);
      setFlagValue(value);
    }
    optionsMap.set(propName, option);
    opts.option?.(option, ctx.flags[propName]);
  }
  return optionsMap;
}
function parseDottedOptions(ctx) {
  ctx.flags = Object.keys(ctx.flags).reduce((result, key) => {
    if (~key.indexOf(".")) {
      key.split(".").reduce((result2, subKey, index, parts) => {
        if (index === parts.length - 1) {
          result2[subKey] = ctx.flags[key];
        } else {
          result2[subKey] = result2[subKey] ?? {};
        }
        return result2[subKey];
      }, result);
    } else {
      result[key] = ctx.flags[key];
    }
    return result;
  }, {});
}
function splitFlags(flag) {
  flag = flag.slice(1);
  const normalized = [];
  const index = flag.indexOf("=");
  const flags = (index !== -1 ? flag.slice(0, index) : flag).split("");
  if (isNaN(Number(flag[flag.length - 1]))) {
    flags.forEach((val) => normalized.push(`-${val}`));
  } else {
    normalized.push(`-${flags.shift()}`);
    if (flags.length) {
      normalized.push(flags.join(""));
    }
  }
  if (index !== -1) {
    normalized[normalized.length - 1] += flag.slice(index);
  }
  return normalized;
}
function parseDefaultType(option, arg, value) {
  const type = arg.type || OptionType.STRING;
  const parseType = DefaultTypes[type];
  if (!parseType) {
    throw new UnknownTypeError(type, Object.keys(DefaultTypes));
  }
  return parseType({
    label: "Option",
    type,
    name: `--${option.name}`,
    value
  });
}

// deno:https://jsr.io/@std/fmt/1.0.8/colors.ts
var { Deno: Deno2 } = globalThis;
var noColor = typeof Deno2?.noColor === "boolean" ? Deno2.noColor : false;
var enabled = !noColor;
function setColorEnabled(value) {
  if (Deno2?.noColor) {
    return;
  }
  enabled = value;
}
function getColorEnabled() {
  return enabled;
}
function code(open, close) {
  return {
    open: `\x1B[${open.join(";")}m`,
    close: `\x1B[${close}m`,
    regexp: new RegExp(`\\x1b\\[${close}m`, "g")
  };
}
function run(str2, code2) {
  return enabled ? `${code2.open}${str2.replace(code2.regexp, code2.open)}${code2.close}` : str2;
}
function bold(str2) {
  return run(str2, code([
    1
  ], 22));
}
function dim(str2) {
  return run(str2, code([
    2
  ], 22));
}
function italic(str2) {
  return run(str2, code([
    3
  ], 23));
}
function underline(str2) {
  return run(str2, code([
    4
  ], 24));
}
function red(str2) {
  return run(str2, code([
    31
  ], 39));
}
function green(str2) {
  return run(str2, code([
    32
  ], 39));
}
function yellow(str2) {
  return run(str2, code([
    33
  ], 39));
}
function blue(str2) {
  return run(str2, code([
    34
  ], 39));
}
function gray(str2) {
  return brightBlack(str2);
}
function brightBlack(str2) {
  return run(str2, code([
    90
  ], 39));
}
function brightBlue(str2) {
  return run(str2, code([
    94
  ], 39));
}
function brightMagenta(str2) {
  return run(str2, code([
    95
  ], 39));
}
var ANSI_PATTERN = new RegExp([
  "[\\u001B\\u009B][[\\]()#;?]*(?:(?:(?:(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]+)*|[a-zA-Z\\d]+(?:;[-a-zA-Z\\d\\/#&.:=?%@~_]*)*)?\\u0007)",
  "(?:(?:\\d{1,4}(?:;\\d{0,4})*)?[\\dA-PR-TXZcf-nq-uy=><~]))"
].join("|"), "g");
function stripAnsiCode(string2) {
  return string2.replace(ANSI_PATTERN, "");
}

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/_utils.ts
function getFlag2(name) {
  if (name.startsWith("-")) {
    return name;
  }
  if (name.length > 1) {
    return `--${name}`;
  }
  return `-${name}`;
}
function didYouMean2(message, type, types) {
  const match = types.length ? closestString(type, types) : void 0;
  return match ? `${message} "${match}"?` : "";
}
function didYouMeanCommand(command, commands, excludes = []) {
  const commandNames = commands.map((command2) => command2.getName()).filter((command2) => !excludes.includes(command2));
  return didYouMean2(" Did you mean command", command, commandNames);
}
var ARGUMENT_REGEX = /^[<\[].+[\]>]$/;
var ARGUMENT_DETAILS_REGEX = /[<\[:>\]]/;
function splitArguments(args) {
  const parts = args.trim().split(/[, =] */g);
  const typeParts = [];
  while (parts[parts.length - 1] && ARGUMENT_REGEX.test(parts[parts.length - 1])) {
    typeParts.unshift(parts.pop());
  }
  const typeDefinition = typeParts.join(" ");
  return {
    flags: parts,
    typeDefinition,
    equalsSign: args.includes("=")
  };
}
function parseArgumentsDefinition(argsDefinition, validate = true, all) {
  const argumentDetails = [];
  let hasOptional = false;
  let hasVariadic = false;
  const parts = argsDefinition.split(/ +/);
  for (const arg of parts) {
    if (validate && hasVariadic) {
      throw new UnexpectedArgumentAfterVariadicArgumentError(arg);
    }
    const parts2 = arg.split(ARGUMENT_DETAILS_REGEX);
    if (!parts2[1]) {
      if (all) {
        argumentDetails.push(parts2[0]);
      }
      continue;
    }
    const type = parts2[2] || OptionType.STRING;
    const details = {
      optional: arg[0] === "[",
      name: parts2[1],
      action: parts2[3] || type,
      variadic: false,
      list: type ? arg.indexOf(type + "[]") !== -1 : false,
      type
    };
    if (validate && !details.optional && hasOptional) {
      throw new UnexpectedRequiredArgumentError(details.name);
    }
    if (arg[0] === "[") {
      hasOptional = true;
    }
    if (details.name.length > 3) {
      const istVariadicLeft = details.name.slice(0, 3) === "...";
      const istVariadicRight = details.name.slice(-3) === "...";
      hasVariadic = details.variadic = istVariadicLeft || istVariadicRight;
      if (istVariadicLeft) {
        details.name = details.name.slice(3);
      } else if (istVariadicRight) {
        details.name = details.name.slice(0, -3);
      }
    }
    argumentDetails.push(details);
  }
  return argumentDetails;
}
function dedent(str2) {
  const lines = str2.split(/\r?\n|\r/g);
  let text = "";
  let indent = 0;
  for (const line of lines) {
    if (text || line.trim()) {
      if (!text) {
        text = line.trimStart();
        indent = line.length - text.length;
      } else {
        text += line.slice(indent);
      }
      text += "\n";
    }
  }
  return text.trimEnd();
}
function getDescription(description, short) {
  return short ? description.trim().split("\n", 1)[0].trim() : dedent(description);
}
function underscoreToCamelCase(str2) {
  return str2.replace(/([a-z])([A-Z])/g, "$1_$2").toLowerCase().replace(/_([a-z])/g, (g) => g[1].toUpperCase());
}

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/_errors.ts
var CommandError = class _CommandError extends Error {
  constructor(message) {
    super(message);
    Object.setPrototypeOf(this, _CommandError.prototype);
  }
};
var ValidationError2 = class _ValidationError extends CommandError {
  exitCode;
  cmd;
  constructor(message, { exitCode } = {}) {
    super(message);
    Object.setPrototypeOf(this, _ValidationError.prototype);
    this.exitCode = exitCode ?? 2;
  }
};
var DuplicateOptionNameError = class _DuplicateOptionNameError extends CommandError {
  constructor(optionName, commandName) {
    super(`An option with name '${bold(getFlag2(optionName))}' is already registered on command '${bold(commandName)}'. If it is intended to override the option, set the '${bold("override")}' option of the '${bold("option")}' method to true.`);
    Object.setPrototypeOf(this, _DuplicateOptionNameError.prototype);
  }
};
var MissingCommandNameError = class _MissingCommandNameError extends CommandError {
  constructor() {
    super("Missing command name.");
    Object.setPrototypeOf(this, _MissingCommandNameError.prototype);
  }
};
var DuplicateCommandNameError = class _DuplicateCommandNameError extends CommandError {
  constructor(name) {
    super(`Duplicate command name "${name}".`);
    Object.setPrototypeOf(this, _DuplicateCommandNameError.prototype);
  }
};
var DuplicateCommandAliasError = class _DuplicateCommandAliasError extends CommandError {
  constructor(alias) {
    super(`Duplicate command alias "${alias}".`);
    Object.setPrototypeOf(this, _DuplicateCommandAliasError.prototype);
  }
};
var CommandNotFoundError = class _CommandNotFoundError extends CommandError {
  constructor(name, commands, excluded) {
    super(`Unknown command "${name}".${didYouMeanCommand(name, commands, excluded)}`);
    Object.setPrototypeOf(this, _CommandNotFoundError.prototype);
  }
};
var DuplicateTypeError = class _DuplicateTypeError extends CommandError {
  constructor(name) {
    super(`Type with name "${name}" already exists.`);
    Object.setPrototypeOf(this, _DuplicateTypeError.prototype);
  }
};
var DuplicateCompletionError = class _DuplicateCompletionError extends CommandError {
  constructor(name) {
    super(`Completion with name "${name}" already exists.`);
    Object.setPrototypeOf(this, _DuplicateCompletionError.prototype);
  }
};
var DuplicateExampleError = class _DuplicateExampleError extends CommandError {
  constructor(name) {
    super(`Example with name "${name}" already exists.`);
    Object.setPrototypeOf(this, _DuplicateExampleError.prototype);
  }
};
var DuplicateEnvVarError = class _DuplicateEnvVarError extends CommandError {
  constructor(name) {
    super(`Environment variable with name "${name}" already exists.`);
    Object.setPrototypeOf(this, _DuplicateEnvVarError.prototype);
  }
};
var MissingRequiredEnvVarError = class _MissingRequiredEnvVarError extends ValidationError2 {
  constructor(envVar) {
    super(`Missing required environment variable "${envVar.names[0]}".`);
    Object.setPrototypeOf(this, _MissingRequiredEnvVarError.prototype);
  }
};
var TooManyEnvVarValuesError = class _TooManyEnvVarValuesError extends CommandError {
  constructor(name) {
    super(`An environment variable can only have one value, but "${name}" has more than one.`);
    Object.setPrototypeOf(this, _TooManyEnvVarValuesError.prototype);
  }
};
var UnexpectedOptionalEnvVarValueError = class _UnexpectedOptionalEnvVarValueError extends CommandError {
  constructor(name) {
    super(`An environment variable cannot have an optional value, but "${name}" is defined as optional.`);
    Object.setPrototypeOf(this, _UnexpectedOptionalEnvVarValueError.prototype);
  }
};
var UnexpectedVariadicEnvVarValueError = class _UnexpectedVariadicEnvVarValueError extends CommandError {
  constructor(name) {
    super(`An environment variable cannot have an variadic value, but "${name}" is defined as variadic.`);
    Object.setPrototypeOf(this, _UnexpectedVariadicEnvVarValueError.prototype);
  }
};
var DefaultCommandNotFoundError = class _DefaultCommandNotFoundError extends CommandError {
  constructor(name, commands) {
    super(`Default command "${name}" not found.${didYouMeanCommand(name, commands)}`);
    Object.setPrototypeOf(this, _DefaultCommandNotFoundError.prototype);
  }
};
var UnknownCommandError = class _UnknownCommandError extends ValidationError2 {
  constructor(name, commands, excluded) {
    super(`Unknown command "${name}".${didYouMeanCommand(name, commands, excluded)}`);
    Object.setPrototypeOf(this, _UnknownCommandError.prototype);
  }
};
var NoArgumentsAllowedError = class _NoArgumentsAllowedError extends ValidationError2 {
  constructor(name) {
    super(`No arguments allowed for command "${name}".`);
    Object.setPrototypeOf(this, _NoArgumentsAllowedError.prototype);
  }
};
var MissingArgumentsError = class _MissingArgumentsError extends ValidationError2 {
  constructor(names) {
    super(`Missing argument(s): ${names.join(", ")}`);
    Object.setPrototypeOf(this, _MissingArgumentsError.prototype);
  }
};
var MissingArgumentError = class _MissingArgumentError extends ValidationError2 {
  constructor(name) {
    super(`Missing argument: ${name}`);
    Object.setPrototypeOf(this, _MissingArgumentError.prototype);
  }
};
var TooManyArgumentsError = class _TooManyArgumentsError extends ValidationError2 {
  constructor(args) {
    super(`Too many arguments: ${args.join(" ")}`);
    Object.setPrototypeOf(this, _TooManyArgumentsError.prototype);
  }
};

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/exit.ts
function exit(code2) {
  const { Deno: Deno4, process: process2 } = globalThis;
  const exit2 = Deno4?.exit ?? process2?.exit;
  if (exit2) {
    exit2(code2);
  }
  throw new Error("unsupported runtime");
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/get_args.ts
function getArgs() {
  const { Deno: Deno4, process: process2 } = globalThis;
  return Deno4?.args ?? process2?.argv.slice(2) ?? [];
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/get_env.ts
function getEnv(name) {
  const { Deno: Deno4, process: process2 } = globalThis;
  if (Deno4) {
    return Deno4.env.get(name);
  } else if (process2) {
    return process2.env[name];
  }
  throw new Error("unsupported runtime");
}

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/border.ts
var border = {
  top: "\u2500",
  topMid: "\u252C",
  topLeft: "\u250C",
  topRight: "\u2510",
  bottom: "\u2500",
  bottomMid: "\u2534",
  bottomLeft: "\u2514",
  bottomRight: "\u2518",
  left: "\u2502",
  leftMid: "\u251C",
  mid: "\u2500",
  midMid: "\u253C",
  right: "\u2502",
  rightMid: "\u2524",
  middle: "\u2502"
};

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/cell.ts
var Cell = class _Cell {
  value;
  options;
  /** Get cell length. */
  get length() {
    return this.toString().length;
  }
  /**
   * Any unterminated ANSI formatting overflowed from previous lines of a
   * multi-line cell.
   */
  get unclosedAnsiRuns() {
    return this.options.unclosedAnsiRuns ?? "";
  }
  set unclosedAnsiRuns(val) {
    this.options.unclosedAnsiRuns = val;
  }
  /**
   * Create a new cell. If value is a cell, the value and all options of the cell
   * will be copied to the new cell.
   *
   * @param value Cell or cell value.
   */
  static from(value) {
    let cell;
    if (value instanceof _Cell) {
      cell = new this(value.getValue());
      cell.options = {
        ...value.options
      };
    } else {
      cell = new this(value);
    }
    return cell;
  }
  /**
   * Cell constructor.
   *
   * @param value Cell value.
   */
  constructor(value) {
    this.value = value;
    this.options = {};
  }
  /** Get cell string value. */
  toString() {
    return this.value.toString();
  }
  /** Get cell value. */
  getValue() {
    return this.value;
  }
  /**
   * Set cell value.
   *
   * @param value Cell or cell value.
   */
  setValue(value) {
    this.value = value;
    return this;
  }
  /**
   * Clone cell with all options.
   *
   * @param value Cell or cell value.
   */
  clone(value) {
    return _Cell.from(value ?? this);
  }
  /**
   * Setter:
   */
  /**
  * Enable/disable cell border.
  *
  * @param enable    Enable/disable cell border.
  * @param override  Override existing value.
  */
  border(enable = true, override = true) {
    if (override || typeof this.options.border === "undefined") {
      this.options.border = enable;
    }
    return this;
  }
  /**
   * Set col span.
   *
   * ```ts
   * import { Cell, Table } from "./mod.ts";
   *
   * new Table()
   *   .body([
   *     [
   *       new Cell("Row 1 & 2 Column 1").rowSpan(2),
   *       "Row 1 Column 2",
   *       "Row 1 Column 3",
   *     ],
   *     [new Cell("Row 2 Column 2 & 3").colSpan(2)],
   *   ])
   *   .border()
   *   .render();
   * ```
   *
   * @param span      Number of cols to span.
   * @param override  Override existing value.
   */
  colSpan(span, override = true) {
    if (override || typeof this.options.colSpan === "undefined") {
      this.options.colSpan = span;
    }
    return this;
  }
  /**
   * Set row span.
   *
   * ```ts
   * import { Cell, Table } from "./mod.ts";
   *
   * new Table()
   *   .body([
   *     [
   *       new Cell("Row 1 & 2 Column 1").rowSpan(2),
   *       "Row 1 Column 2",
   *       "Row 1 Column 3",
   *     ],
   *     [new Cell("Row 2 Column 2 & 3").colSpan(2)],
   *   ])
   *   .border()
   *   .render();
   * ```
   *
   * @param span      Number of rows to span.
   * @param override  Override existing value.
   */
  rowSpan(span, override = true) {
    if (override || typeof this.options.rowSpan === "undefined") {
      this.options.rowSpan = span;
    }
    return this;
  }
  /**
   * Align cell content.
   *
   * @param direction Align direction.
   * @param override  Override existing value.
   */
  align(direction, override = true) {
    if (override || typeof this.options.align === "undefined") {
      this.options.align = direction;
    }
    return this;
  }
  /**
   * Getter:
   */
  /** Check if cell has border. */
  getBorder() {
    return this.options.border === true;
  }
  /** Get col span. */
  getColSpan() {
    return typeof this.options.colSpan === "number" && this.options.colSpan > 0 ? this.options.colSpan : 1;
  }
  /** Get row span. */
  getRowSpan() {
    return typeof this.options.rowSpan === "number" && this.options.rowSpan > 0 ? this.options.rowSpan : 1;
  }
  /** Get row span. */
  getAlign() {
    return this.options.align ?? "left";
  }
};

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/column.ts
var Column = class _Column {
  /**
   * Create a new cell from column options or an existing column.
   * @param options
   */
  static from(options) {
    const opts = options instanceof _Column ? options.opts : options;
    return new _Column().options(opts);
  }
  opts = {};
  /** Set column options. */
  options(options) {
    Object.assign(this.opts, options);
    return this;
  }
  /** Set min column width. */
  minWidth(width) {
    this.opts.minWidth = width;
    return this;
  }
  /** Set max column width. */
  maxWidth(width) {
    this.opts.maxWidth = width;
    return this;
  }
  /** Set column border. */
  border(border2 = true) {
    this.opts.border = border2;
    return this;
  }
  /** Set column padding. */
  padding(padding3) {
    this.opts.padding = padding3;
    return this;
  }
  /** Set column alignment. */
  align(direction) {
    this.opts.align = direction;
    return this;
  }
  /** Get min column width. */
  getMinWidth() {
    return this.opts.minWidth;
  }
  /** Get max column width. */
  getMaxWidth() {
    return this.opts.maxWidth;
  }
  /** Get column border. */
  getBorder() {
    return this.opts.border;
  }
  /** Get column padding. */
  getPadding() {
    return this.opts.padding;
  }
  /** Get column alignment. */
  getAlign() {
    return this.opts.align;
  }
};

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/unicode_width.ts
var tables = null;
var data = {
  "UNICODE_VERSION": "15.0.0",
  "tables": [
    {
      "d": "AAECAwQFBgcICQoLDA0OAw8DDwkQCRESERIA",
      "r": "AQEBAgEBAQEBAQEBAQEBBwEHAVABBwcBBwF4"
    },
    {
      "d": "AAECAwQFBgcGCAYJCgsMDQ4PEAYREhMUBhUWFxgZGhscHR4fICEiIyIkJSYnKCkqJSssLS4vMDEyMzQ1Njc4OToGOzwKBj0GPj9AQUIGQwZEBkVGR0hJSktMTQZOBgoGT1BRUlNUVVZXWFkGWgZbBlxdXl1fYGFiY2RlZmdoBmlqBmsGAQZsBm1uO29wcXI7czt0dXZ3OwY7eHkGent8Bn0Gfn+AgYKDhIWGBoc7iAZdO4kGiosGAXGMBo0GjgaPBpAGkQaSBpMGlJUGlpcGmJmam5ydnp+gLgahLKIGo6SlpganqKmqqwasBq0Grq8GsLGyswa0BrUGtre4Brm6uwZHvAa9vga/wME7wjvDxAbFO8bHO8gGyQbKywbMzQbOBs/Q0QbSBr8GvgbT1AbUBtUG1gbXBtjZ2tsG3N0G3t/g4eLjO+Tl5ufoO+k76gbrBuztOwbu7/AGO+XxCgYKCwZd8g==",
      "r": "AQEBAQEBAQEBAQEBAQEBAQEBAQMBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQECBQEOAQEBAQEBAQEBAwEBAQEBAQEBAQIBAwEIAQEBAQEBAQEBAQEBAQIBAQEBAQEBAQEBAQEBAQEBDQEBBQEBAQEBAgEBAwEBAQEBAQEBAQEBbQHaAQEFAQEBBAECAQEBAQEBAQEBAwGuASFkCAELAQEBAQEBAQEHAQMBAQEaAQIBCAEFAQEBAQEBAQEBAQEBAQEBAQEBAQECAQEBAQIBAQEBAQEBAwEDAQEBAQEBAQUBAQEBAQEBBAEBAVIBAdkBARABAQFfARMBAYoBBAEBBQEmAUkBAQcBAQIBHgEBARUBAQEBAQUBAQcBDwEBARoBAgEBAQEBAQECAQEBAQEBAQEBAQEBAQEBAQMBBAEBAgEBAQEUfwEBAQIDAXj/AQ=="
    },
    {
      "d": "AFUVAF3Xd3X/93//VXVVV9VX9V91f1/31X93XVXdVdVV9dVV/VVX1X9X/131VfXVVXV3V1VdVV1V1/1dV1X/3VUAVf3/3/9fVf3/3/9fVV1V/11VFQBQVQEAEEEQVQBQVQBAVFUVAFVUVQUAEAAUBFBVFVFVAEBVBQBUVRUAVVFVBRAAAVBVAVVQVQBVBQBAVUVUAQBUUQEAVQVVUVVUAVRVUVUFVUVBVVRBFRRQUVVQUVUBEFRRVQVVBQBRVRQBVFVRVUFVBVVFVVRVUVVUVQRUBQRQVUFVBVVFVVBVBVVQVRVUAVRVUVUFVVFVRVUFRFVRAEBVFQBAVVEAVFUAQFVQVRFRVQEAQAAEVQEAAQBUVUVVAQQAQVVQBVRVAVRVRUFVUVVRVaoAVQFVBVRVBVUFVQVVEABQVUUBAFVRVRUAVUFVUVVAFVRVRVUBVRUUVUUAQEQBAFQVABRVAEBVAFUEQFRFVRUAVVBVBVAQUFVFUBFQVQAFVUAABABUUVVUUFUVANd/X3//BUD3XdV1VQAEAFVXVdX9V1VXVQBUVdVdVdV1VX111VXVV9V//1X/X1VdVf9fVV9VdVdV1VX31dfVXXX9193/d1X/VV9VV3VVX//1VfVVXVVdVdVVdVWlVWlVqVaWVf/f/1X/Vf/1X1Xf/19V9VVf9df1X1X1X1XVVWlVfV31VVpVd1V3VapV33/fVZVVlVX1WVWlVelV+v/v//7/31Xv/6/77/tVWaVVVlVdVWaVmlX1/1WpVVZVlVWVVlVW+V9VFVBVAKqaqlWqWlWqVaoKoKpqqapqgapVqaqpqmqqVapqqv+qVqpqVRVAAFBVBVVQVUUVVUFVVFVQVQBQVRVVBQBQVRUAUFWqVkBVFQVQVVFVAUBBVRVVVFVUVQQUVAVRVVBVRVVRVFFVqlVFVQCqWlUAqmqqaqpVqlZVqmpVAV1VUVVUVQVAVQFBVQBVQBVVQVUAVRVUVQFVBQBUVQVQVVFVAEBVFFRVFVBVFUBBUUVVUVVAVRUAAQBUVRVVUFUFAEBVARRVFVAEVUVVFQBAVVRVBQBUAFRVAAVEVUVVFQBEFQRVBVBVEFRVUFUVAEARVFUVUQAQVQEFEABVFQBBVRVEFVUABVVUVQEAQFUVABRAVRVVAUABVQUAQFBVAEAAEFUFAAUABEFVAUBFEAAQVVARVRVUVVBVBUBVRFVUFQBQVQBUVQBAVRVVFUBVqlRVWlWqVapaVapWVaqpqmmqalVlVWpZVapVqlVBAFUAUABAVRVQVRUAQAEAVQVQVQVUVQBAFQBUVVFVVFUVAAEAVQBAABQAEARAVUVVAFUAQFUAQFVWVZVV/39V/1//X1X/76uq6v9XVWpVqlWqVlVaVapaVapWVamqmqqmqlWqapWqVapWqmqmqpaqWlWVaqpVZVVpVVZVlapVqlpVVmqpVapVlVZVqlZVqlVWVapqqpqqVapWqlZVqpqqWlWlqlWqVlWqVlVRVQD/Xw==",
      "r": "CBcBCAEBAQEBAQEBAQECAQEBAQEBAQEBAQEBAQMBAQECAQEBAQEBAQEBAQEBBAEBGAEDAQwBAwEIAQEBAQEBAQgcCAEDAQEBAQEDAQEBDQEDEAELAQEBEQEKAQEBDgEBAgIBAQoBBQQBCAEBAQEBAQEHAQEHBgEWAQIBDQECAgEFAQECAgEKAQ0BAQIKAQ0BDQEBAQEBAQEBAgEHAQ4BAQEBAQQBBgEBDgEBAQEBAQcBAQIBAQEBBAEFAQEBDgEBAQEBAQECAQcBDwECAQwCDQEBAQEBAQECAQgBAQEEAQcBDQEBAQEBAQQBBwERAQEBARYBAQECAQEBGAECAQIBARIBBgEBDQECAQEBAQECAQgBAQEZAQEBAgYBAQEDAQECAQEBAQMBCBgIBwEMAQEGAQcBBwEQAQEBAQEBAgIBCgEBDQEIAQ0BAQEBAQEBBgEBDgEBAQEBAQEBAgEMBwEMAQwBAQEBCQECAwEHAQEBAQ0BAQEBDgIBBgEDAQEBAQEBAQMBAQEBAgEBAQEBAQEBCAEBAgEBAQEBAQkBCAgBAwECAQEBAgEBAQkBAQEBAwECAQMBAQIBBwEFAQEDAQYBAQEBAgEBAQEBAQEBAQECAgEDAQECBAIDAgIBBQEEAQEBAwEPAQEBCyIBCAEJAwQBAQIBAQEBAgECAQEBAQMBAQEBAwEBAQEBAQEBAQgBAQMDAgEBAwEEAQIBAQEBBAEBAQEBAQECAQEBAQEBAQEBAQEHAQQBAwEBAQcBAgUBBgECAQYBAQwBAQEUAQELCAYBFgMFAQYDAQoBAQMBARQBAQkBAQoBBgEVAwsBCgIPAQ0BGQEBAgEHARQBAwIBBgEBAQUBBgQBAgEJAQEBBQECAQMHAQELAQECCQEQAQECAgECAQsBDAEBAQEBCgEBAQsBAQEECQ4BCAQCAQEECAEEAQEFCAEPAQEEAQEPAQgBFAEBAQEBAQEKAQEJAQ8BEAEBEwEBAQIBCwEBDgENAwEKAQEBAQELAQEBAQECAQwBCAEBAQEBDgEDAQwBAQECAQEXAQEBAQEHAgEBBQEIAQEBAQEQAgEBBQEUAQEBAQEbAQEBAQEGARQBAQEBARkBAQEBCQEBAQEQAQIBDwEBARQBAQEBBwEBAQkBAQEBAQECAQEBCwECAQEVAQEBAQQBBQEBAQEOAQEBAQEBEgEBFgEBAgEMAQEBAQ8BAQMBFgEBDgEBBQEPAQETAQECAQMOAgUBCgIBGQEBAQEIAQMBBwEBAwECEwgBAQcLAQUBFwEBAQEDAQEBBwEBBAEBDg0BAQwBAQEDAQQBAQEDBAEBBAEBAQEBEAEPAQgBAQsBAQ4BEQEMAgEBBwEOAQEHAQEBAQQBBAEDCwECAQEBAwEBBggBAgEBAREBBQMKAQEBAwQCEQEBHgEPAQIBAQYEAQYBAwEUAQUMAQEBAQEBAQECAQEBAgEIAwEBBgsBAgEODAMBAgEBCwEBAQEBAwECAQECAQEBBwgPAQ=="
    }
  ]
};
function lookupWidth(cp) {
  if (!tables) tables = data.tables.map(runLengthDecode);
  const t1Offset = tables[0][cp >> 13 & 255];
  const t2Offset = tables[1][128 * t1Offset + (cp >> 6 & 127)];
  const packedWidths = tables[2][16 * t2Offset + (cp >> 2 & 15)];
  const width = packedWidths >> 2 * (cp & 3) & 3;
  return width === 3 ? 1 : width;
}
var cache = /* @__PURE__ */ new Map();
function charWidth(char) {
  if (cache.has(char)) return cache.get(char);
  const codePoint = char.codePointAt(0);
  let width = null;
  if (codePoint < 127) {
    width = codePoint >= 32 ? 1 : codePoint === 0 ? 0 : null;
  } else if (codePoint >= 160) {
    width = lookupWidth(codePoint);
  } else {
    width = null;
  }
  cache.set(char, width);
  return width;
}
function unicodeWidth(str2) {
  return [
    ...str2
  ].map((ch) => charWidth(ch) ?? 0).reduce((a, b) => a + b, 0);
}
function runLengthDecode({ d, r }) {
  const data2 = atob(d);
  const runLengths = atob(r);
  let out = "";
  for (const [i, ch] of [
    ...runLengths
  ].entries()) {
    out += data2[i].repeat(ch.codePointAt(0));
  }
  return Uint8Array.from([
    ...out
  ].map((x) => x.codePointAt(0)));
}

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/_utils.ts
function longest(index, rows, maxWidth) {
  const cellLengths = rows.map((row) => {
    const cell = row[index];
    const cellValue = cell instanceof Cell && cell.getColSpan() > 1 ? "" : cell?.toString() || "";
    return cellValue.split("\n").map((line) => {
      const str2 = typeof maxWidth === "undefined" ? line : consumeWords(maxWidth, line);
      return strLength(str2) || 0;
    });
  }).flat();
  return Math.max(...cellLengths);
}
var strLength = (str2) => {
  return unicodeWidth(stripAnsiCode(str2));
};
var ansiRegexSource = /\x1b\[(?:(?<_0>0)|(?<_22>1|2|22)|(?<_23>3|23)|(?<_24>4|24)|(?<_27>7|27)|(?<_28>8|28)|(?<_29>9|29)|(?<_39>30|31|32|33|34|35|36|37|38;2;\d+;\d+;\d+|38;5;\d+|39|90|91|92|93|94|95|96|97)|(?<_49>40|41|42|43|44|45|46|47|48;2;\d+;\d+;\d+|48;5;\d+|49|100|101|102|103|104|105|106|107))m/.source;
function getUnclosedAnsiRuns(text) {
  const tokens = [];
  for (const { groups } of text.matchAll(new RegExp(ansiRegexSource, "g"))) {
    const [_kind, content] = Object.entries(groups).find(([_, val]) => val);
    tokens.push({
      kind: _kind.slice(1),
      content
    });
  }
  let unclosed = [];
  for (const token of tokens) {
    unclosed = [
      ...unclosed.filter((y) => y.kind !== token.kind),
      token
    ];
  }
  unclosed = unclosed.filter(({ content, kind }) => content !== kind);
  const currentSuffix = unclosed.map(({ kind }) => `\x1B[${kind}m`).reverse().join("");
  const nextPrefix = unclosed.map(({ content }) => `\x1B[${content}m`).join("");
  return {
    /** The suffix to be appended to the text to close all unclosed runs. */
    currentSuffix,
    /**
     * The prefix to be appended to the next segment to continue unclosed
     * runs if the input text forms the first segment of a multi-line string.
     */
    nextPrefix
  };
}

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/consume_words.ts
function consumeWords(length, content) {
  let consumed = "";
  const words = content.split("\n")[0]?.split(/ /g);
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (consumed) {
      const nextLength = strLength(word);
      const consumedLength = strLength(consumed);
      if (consumedLength + nextLength >= length) {
        break;
      }
    }
    consumed += (i > 0 ? " " : "") + word;
  }
  return consumed;
}
function consumeChars(length, content) {
  let consumed = "";
  const chars = [
    ...content.split("\n")[0].matchAll(new RegExp(`(?:${ansiRegexSource})+|.`, "gu"))
  ].map(([match]) => match);
  for (const char of chars) {
    if (consumed) {
      const nextLength = strLength(char);
      const consumedLength = strLength(consumed);
      if (consumedLength + nextLength > length) {
        break;
      }
    }
    consumed += char;
  }
  return consumed;
}

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/row.ts
var Row = class _Row extends Array {
  options = {};
  /**
   * Create a new row. If cells is a row, all cells and options of the row will
   * be copied to the new row.
   *
   * @param cells Cells or row.
   */
  static from(cells) {
    const row = new this(...cells);
    if (cells instanceof _Row) {
      row.options = {
        ...cells.options
      };
    }
    return row;
  }
  /** Clone row recursively with all options. */
  clone() {
    const row = new _Row(...this.map((cell) => cell instanceof Cell ? cell.clone() : cell));
    row.options = {
      ...this.options
    };
    return row;
  }
  /**
   * Setter:
   */
  /**
  * Enable/disable cell border.
  *
  * @param enable    Enable/disable cell border.
  * @param override  Override existing value.
  */
  border(enable = true, override = true) {
    if (override || typeof this.options.border === "undefined") {
      this.options.border = enable;
    }
    return this;
  }
  /**
   * Align row content.
   *
   * @param direction Align direction.
   * @param override  Override existing value.
   */
  align(direction, override = true) {
    if (override || typeof this.options.align === "undefined") {
      this.options.align = direction;
    }
    return this;
  }
  /**
   * Getter:
   */
  /** Check if row has border. */
  getBorder() {
    return this.options.border === true;
  }
  /** Check if row or any child cell has border. */
  hasBorder() {
    return this.getBorder() || this.some((cell) => cell instanceof Cell && cell.getBorder());
  }
  /** Get row alignment. */
  getAlign() {
    return this.options.align ?? "left";
  }
};

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/_layout.ts
var TableLayout = class {
  table;
  options;
  /**
   * Table layout constructor.
   * @param table   Table instance.
   * @param options Render options.
   */
  constructor(table, options) {
    this.table = table;
    this.options = options;
  }
  /** Generate table string. */
  toString() {
    const opts = this.createLayout();
    return opts.rows.length ? this.renderRows(opts) : "";
  }
  /**
   * Generates table layout including row and col span, converts all none
   * Cell/Row values to Cells and Rows and returns the layout rendering
   * settings.
   */
  createLayout() {
    Object.keys(this.options.chars).forEach((key) => {
      if (typeof this.options.chars[key] !== "string") {
        this.options.chars[key] = "";
      }
    });
    const hasBodyBorder = this.table.getBorder() || this.table.hasBodyBorder();
    const hasHeaderBorder = this.table.hasHeaderBorder();
    const hasBorder = hasHeaderBorder || hasBodyBorder;
    const rows = this.#getRows();
    const columns = Math.max(...rows.map((row) => row.length));
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const row = rows[rowIndex];
      const length = row.length;
      if (length < columns) {
        const diff = columns - length;
        for (let i = 0; i < diff; i++) {
          row.push(this.createCell(null, row, rowIndex, length + i));
        }
      }
    }
    const padding3 = [];
    const width = [];
    for (let colIndex = 0; colIndex < columns; colIndex++) {
      const column = this.options.columns.at(colIndex);
      const minColWidth = column?.getMinWidth() ?? (Array.isArray(this.options.minColWidth) ? this.options.minColWidth[colIndex] : this.options.minColWidth);
      const maxColWidth = column?.getMaxWidth() ?? (Array.isArray(this.options.maxColWidth) ? this.options.maxColWidth[colIndex] : this.options.maxColWidth);
      const colWidth = longest(colIndex, rows, maxColWidth);
      width[colIndex] = Math.min(maxColWidth, Math.max(minColWidth, colWidth));
      padding3[colIndex] = column?.getPadding() ?? (Array.isArray(this.options.padding) ? this.options.padding[colIndex] : this.options.padding);
    }
    return {
      padding: padding3,
      width,
      rows,
      columns,
      hasBorder,
      hasBodyBorder,
      hasHeaderBorder
    };
  }
  #getRows() {
    const header = this.table.getHeader();
    const rows = header ? [
      header,
      ...this.table
    ] : this.table.slice();
    const hasSpan = rows.some((row) => row.some((cell) => cell instanceof Cell && (cell.getColSpan() > 1 || cell.getRowSpan() > 1)));
    if (hasSpan) {
      return this.spanRows(rows);
    }
    return rows.map((row, rowIndex) => {
      const newRow = this.createRow(row);
      for (let colIndex = 0; colIndex < row.length; colIndex++) {
        newRow[colIndex] = this.createCell(row[colIndex], newRow, rowIndex, colIndex);
      }
      return newRow;
    });
  }
  /**
   * Fills rows and cols by specified row/col span with a reference of the
   * original cell.
   */
  spanRows(rows) {
    const rowSpan = [];
    let colSpan = 1;
    let rowIndex = -1;
    while (true) {
      rowIndex++;
      if (rowIndex === rows.length && rowSpan.every((span) => span === 1)) {
        break;
      }
      const row = rows[rowIndex] = this.createRow(rows[rowIndex] || []);
      let colIndex = -1;
      while (true) {
        colIndex++;
        if (colIndex === row.length && colIndex === rowSpan.length && colSpan === 1) {
          break;
        }
        if (colSpan > 1) {
          colSpan--;
          rowSpan[colIndex] = rowSpan[colIndex - 1];
          row.splice(colIndex, this.getDeleteCount(rows, rowIndex, colIndex), row[colIndex - 1]);
          continue;
        }
        if (rowSpan[colIndex] > 1) {
          rowSpan[colIndex]--;
          rows[rowIndex].splice(colIndex, this.getDeleteCount(rows, rowIndex, colIndex), rows[rowIndex - 1][colIndex]);
          continue;
        }
        const cell = row[colIndex] = this.createCell(row[colIndex] || null, row, rowIndex, colIndex);
        colSpan = cell.getColSpan();
        rowSpan[colIndex] = cell.getRowSpan();
      }
    }
    return rows;
  }
  getDeleteCount(rows, rowIndex, colIndex) {
    return colIndex <= rows[rowIndex].length - 1 && typeof rows[rowIndex][colIndex] === "undefined" ? 1 : 0;
  }
  /**
   * Create a new row from existing row or cell array.
   * @param row Original row.
   */
  createRow(row) {
    return Row.from(row).border(this.table.getBorder(), false).align(this.table.getAlign(), false);
  }
  /**
   * Create a new cell from existing cell or cell value.
   *
   * @param cell      Original cell.
   * @param row       Parent row.
   * @param rowIndex  The row index of the cell.
   * @param colIndex  The column index of the cell.
   */
  createCell(cell, row, rowIndex, colIndex) {
    const column = this.options.columns.at(colIndex);
    const isHeaderRow = this.isHeaderRow(rowIndex);
    return Cell.from(cell ?? "").border((isHeaderRow ? null : column?.getBorder()) ?? row.getBorder(), false).align((isHeaderRow ? null : column?.getAlign()) ?? row.getAlign(), false);
  }
  isHeaderRow(rowIndex) {
    return rowIndex === 0 && this.table.getHeader() !== void 0;
  }
  /**
   * Render table layout.
   * @param opts Render options.
   */
  renderRows(opts) {
    let result = "";
    const rowSpan = new Array(opts.columns).fill(1);
    for (let rowIndex = 0; rowIndex < opts.rows.length; rowIndex++) {
      result += this.renderRow(rowSpan, rowIndex, opts);
    }
    return result.slice(0, -1);
  }
  /**
   * Render row.
   * @param rowSpan     Current row span.
   * @param rowIndex    Current row index.
   * @param opts        Render options.
   * @param isMultiline Is multiline row.
   */
  renderRow(rowSpan, rowIndex, opts, isMultiline) {
    const row = opts.rows[rowIndex];
    const prevRow = opts.rows[rowIndex - 1];
    const nextRow = opts.rows[rowIndex + 1];
    let result = "";
    let colSpan = 1;
    if (!isMultiline && rowIndex === 0 && row.hasBorder()) {
      result += this.renderBorderRow(void 0, row, rowSpan, opts);
    }
    let isMultilineRow = false;
    result += " ".repeat(this.options.indent || 0);
    for (let colIndex = 0; colIndex < opts.columns; colIndex++) {
      if (colSpan > 1) {
        colSpan--;
        rowSpan[colIndex] = rowSpan[colIndex - 1];
        continue;
      }
      result += this.renderCell(colIndex, row, opts);
      if (rowSpan[colIndex] > 1) {
        if (!isMultiline) {
          rowSpan[colIndex]--;
        }
      } else if (!prevRow || prevRow[colIndex] !== row[colIndex]) {
        rowSpan[colIndex] = row[colIndex].getRowSpan();
      }
      colSpan = row[colIndex].getColSpan();
      if (rowSpan[colIndex] === 1 && row[colIndex].length) {
        isMultilineRow = true;
      }
    }
    if (opts.columns > 0) {
      if (row[opts.columns - 1].getBorder()) {
        result += this.options.chars.right;
      } else if (opts.hasBorder) {
        result += " ";
      }
    }
    result += "\n";
    if (isMultilineRow) {
      return result + this.renderRow(rowSpan, rowIndex, opts, isMultilineRow);
    }
    if (opts.rows.length > 1 && (rowIndex === 0 && opts.hasHeaderBorder || rowIndex < opts.rows.length - 1 && opts.hasBodyBorder)) {
      result += this.renderBorderRow(row, nextRow, rowSpan, opts);
    }
    if (rowIndex === opts.rows.length - 1 && row.hasBorder()) {
      result += this.renderBorderRow(row, void 0, rowSpan, opts);
    }
    return result;
  }
  /**
   * Render cell.
   * @param colIndex  Current col index.
   * @param row       Current row.
   * @param opts      Render options.
   * @param noBorder  Disable border.
   */
  renderCell(colIndex, row, opts, noBorder) {
    let result = "";
    const prevCell = row[colIndex - 1];
    const cell = row[colIndex];
    if (!noBorder) {
      if (colIndex === 0) {
        if (cell.getBorder()) {
          result += this.options.chars.left;
        } else if (opts.hasBorder) {
          result += " ";
        }
      } else {
        if (cell.getBorder() || prevCell?.getBorder()) {
          result += this.options.chars.middle;
        } else if (opts.hasBorder) {
          result += " ";
        }
      }
    }
    let maxLength = opts.width[colIndex];
    const colSpan = cell.getColSpan();
    if (colSpan > 1) {
      for (let o = 1; o < colSpan; o++) {
        maxLength += opts.width[colIndex + o] + opts.padding[colIndex + o];
        if (opts.hasBorder) {
          maxLength += opts.padding[colIndex + o] + 1;
        }
      }
    }
    const { current, next } = this.renderCellValue(cell, maxLength);
    row[colIndex].setValue(next);
    if (opts.hasBorder) {
      result += " ".repeat(opts.padding[colIndex]);
    }
    result += current;
    if (opts.hasBorder || colIndex < opts.columns - 1) {
      result += " ".repeat(opts.padding[colIndex]);
    }
    return result;
  }
  /**
   * Render specified length of cell. Returns the rendered value and a new cell
   * with the rest value.
   * @param cell      Cell to render.
   * @param maxLength Max length of content to render.
   */
  renderCellValue(cell, maxLength) {
    const length = Math.min(maxLength, strLength(cell.toString()));
    let words = consumeWords(length, cell.toString());
    const breakWord = strLength(words) > length;
    if (breakWord) {
      words = consumeChars(length, words);
    }
    const next = cell.toString().slice(words.length + (breakWord ? 0 : 1));
    words = cell.unclosedAnsiRuns + words;
    const { currentSuffix, nextPrefix } = getUnclosedAnsiRuns(words);
    words += currentSuffix;
    cell.unclosedAnsiRuns = nextPrefix;
    const fillLength = maxLength - strLength(words);
    const align = cell.getAlign();
    let current;
    if (fillLength === 0) {
      current = words;
    } else if (align === "left") {
      current = words + " ".repeat(fillLength);
    } else if (align === "center") {
      current = " ".repeat(Math.floor(fillLength / 2)) + words + " ".repeat(Math.ceil(fillLength / 2));
    } else if (align === "right") {
      current = " ".repeat(fillLength) + words;
    } else {
      throw new Error("Unknown direction: " + align);
    }
    return {
      current,
      next
    };
  }
  /**
   * Render border row.
   * @param prevRow Previous row.
   * @param nextRow Next row.
   * @param rowSpan Current row span.
   * @param opts    Render options.
   */
  renderBorderRow(prevRow, nextRow, rowSpan, opts) {
    let result = "";
    let colSpan = 1;
    for (let colIndex = 0; colIndex < opts.columns; colIndex++) {
      if (rowSpan[colIndex] > 1) {
        if (!nextRow) {
          throw new Error("invalid layout");
        }
        if (colSpan > 1) {
          colSpan--;
          continue;
        }
      }
      result += this.renderBorderCell(colIndex, prevRow, nextRow, rowSpan, opts);
      colSpan = nextRow?.[colIndex].getColSpan() ?? 1;
    }
    return result.length ? " ".repeat(this.options.indent) + result + "\n" : "";
  }
  /**
   * Render border cell.
   * @param colIndex  Current index.
   * @param prevRow   Previous row.
   * @param nextRow   Next row.
   * @param rowSpan   Current row span.
   * @param opts      Render options.
   */
  renderBorderCell(colIndex, prevRow, nextRow, rowSpan, opts) {
    const a1 = prevRow?.[colIndex - 1];
    const a2 = nextRow?.[colIndex - 1];
    const b1 = prevRow?.[colIndex];
    const b2 = nextRow?.[colIndex];
    const a1Border = !!a1?.getBorder();
    const a2Border = !!a2?.getBorder();
    const b1Border = !!b1?.getBorder();
    const b2Border = !!b2?.getBorder();
    const hasColSpan = (cell) => (cell?.getColSpan() ?? 1) > 1;
    const hasRowSpan = (cell) => (cell?.getRowSpan() ?? 1) > 1;
    let result = "";
    if (colIndex === 0) {
      if (rowSpan[colIndex] > 1) {
        if (b1Border) {
          result += this.options.chars.left;
        } else {
          result += " ";
        }
      } else if (b1Border && b2Border) {
        result += this.options.chars.leftMid;
      } else if (b1Border) {
        result += this.options.chars.bottomLeft;
      } else if (b2Border) {
        result += this.options.chars.topLeft;
      } else {
        result += " ";
      }
    } else if (colIndex < opts.columns) {
      if (a1Border && b2Border || b1Border && a2Border) {
        const a1ColSpan = hasColSpan(a1);
        const a2ColSpan = hasColSpan(a2);
        const b1ColSpan = hasColSpan(b1);
        const b2ColSpan = hasColSpan(b2);
        const a1RowSpan = hasRowSpan(a1);
        const a2RowSpan = hasRowSpan(a2);
        const b1RowSpan = hasRowSpan(b1);
        const b2RowSpan = hasRowSpan(b2);
        const hasAllBorder = a1Border && b2Border && b1Border && a2Border;
        const hasAllRowSpan = a1RowSpan && b1RowSpan && a2RowSpan && b2RowSpan;
        const hasAllColSpan = a1ColSpan && b1ColSpan && a2ColSpan && b2ColSpan;
        if (hasAllRowSpan && hasAllBorder) {
          result += this.options.chars.middle;
        } else if (hasAllColSpan && hasAllBorder && a1 === b1 && a2 === b2) {
          result += this.options.chars.mid;
        } else if (a1ColSpan && b1ColSpan && a1 === b1) {
          result += this.options.chars.topMid;
        } else if (a2ColSpan && b2ColSpan && a2 === b2) {
          result += this.options.chars.bottomMid;
        } else if (a1RowSpan && a2RowSpan && a1 === a2) {
          result += this.options.chars.leftMid;
        } else if (b1RowSpan && b2RowSpan && b1 === b2) {
          result += this.options.chars.rightMid;
        } else {
          result += this.options.chars.midMid;
        }
      } else if (a1Border && b1Border) {
        if (hasColSpan(a1) && hasColSpan(b1) && a1 === b1) {
          result += this.options.chars.bottom;
        } else {
          result += this.options.chars.bottomMid;
        }
      } else if (b1Border && b2Border) {
        if (rowSpan[colIndex] > 1) {
          result += this.options.chars.left;
        } else {
          result += this.options.chars.leftMid;
        }
      } else if (b2Border && a2Border) {
        if (hasColSpan(a2) && hasColSpan(b2) && a2 === b2) {
          result += this.options.chars.top;
        } else {
          result += this.options.chars.topMid;
        }
      } else if (a1Border && a2Border) {
        if (hasRowSpan(a1) && a1 === a2) {
          result += this.options.chars.right;
        } else {
          result += this.options.chars.rightMid;
        }
      } else if (a1Border) {
        result += this.options.chars.bottomRight;
      } else if (b1Border) {
        result += this.options.chars.bottomLeft;
      } else if (a2Border) {
        result += this.options.chars.topRight;
      } else if (b2Border) {
        result += this.options.chars.topLeft;
      } else {
        result += " ";
      }
    }
    const length = opts.padding[colIndex] + opts.width[colIndex] + opts.padding[colIndex];
    if (rowSpan[colIndex] > 1 && nextRow) {
      result += this.renderCell(colIndex, nextRow, opts, true);
      if (nextRow[colIndex] === nextRow[nextRow.length - 1]) {
        if (b1Border) {
          result += this.options.chars.right;
        } else {
          result += " ";
        }
        return result;
      }
    } else if (b1Border && b2Border) {
      result += this.options.chars.mid.repeat(length);
    } else if (b1Border) {
      result += this.options.chars.bottom.repeat(length);
    } else if (b2Border) {
      result += this.options.chars.top.repeat(length);
    } else {
      result += " ".repeat(length);
    }
    if (colIndex === opts.columns - 1) {
      if (b1Border && b2Border) {
        result += this.options.chars.rightMid;
      } else if (b1Border) {
        result += this.options.chars.bottomRight;
      } else if (b2Border) {
        result += this.options.chars.topRight;
      } else {
        result += " ";
      }
    }
    return result;
  }
};

// deno:https://jsr.io/@cliffy/table/1.0.0-rc.8/table.ts
var Table = class _Table extends Array {
  static _chars = {
    ...border
  };
  options = {
    indent: 0,
    border: false,
    maxColWidth: Infinity,
    minColWidth: 0,
    padding: 1,
    chars: {
      ..._Table._chars
    },
    columns: []
  };
  headerRow;
  /**
   * Create a new table. If rows is a table, all rows and options of the table
   * will be copied to the new table.
   *
   * @param rows An array of rows or a table instance.
   */
  static from(rows) {
    const table = new this(...rows);
    if (rows instanceof _Table) {
      table.options = {
        ...rows.options
      };
      table.headerRow = rows.headerRow ? Row.from(rows.headerRow) : void 0;
    }
    return table;
  }
  /**
   * Create a new table from an array of json objects. An object represents a
   * row and each property a column.
   *
   * @param rows Array of objects.
   */
  static fromJson(rows) {
    return new this().fromJson(rows);
  }
  /**
   * Set global default border characters.
   *
   * @param chars Border options.
   */
  static chars(chars) {
    Object.assign(this._chars, chars);
    return this;
  }
  /**
   * Write table or rows to stdout.
   *
   * @param rows Table or rows.
   */
  static render(rows) {
    _Table.from(rows).render();
  }
  /**
   * Read data from an array of json objects. An object represents a
   * row and each property a column.
   *
   * @param rows Array of objects.
   */
  fromJson(rows) {
    this.header(Object.keys(rows[0]));
    this.body(rows.map((row) => Object.values(row)));
    return this;
  }
  /**
   * Set column options.
   *
   * @param columns An array of columns or column options.
   */
  columns(columns) {
    this.options.columns = columns.map((column) => column instanceof Column ? column : Column.from(column));
    return this;
  }
  /**
   * Set column options by index.
   *
   @param index   The column index.
   @param column  Column or column options.
   */
  column(index, column) {
    if (column instanceof Column) {
      this.options.columns[index] = column;
    } else if (this.options.columns[index]) {
      this.options.columns[index].options(column);
    } else {
      this.options.columns[index] = Column.from(column);
    }
    return this;
  }
  /**
   * Set table header.
   *
   * @param header Header row or cells.
   */
  header(header) {
    this.headerRow = header instanceof Row ? header : Row.from(header);
    return this;
  }
  /**
   * Set table body.
   *
   * @param rows Array of rows.
   */
  body(rows) {
    this.length = 0;
    this.push(...rows);
    return this;
  }
  /** Clone table recursively with header and options. */
  clone() {
    const table = new _Table(...this.map((row) => row instanceof Row ? row.clone() : Row.from(row).clone()));
    table.options = {
      ...this.options
    };
    table.headerRow = this.headerRow?.clone();
    return table;
  }
  /** Generate table string. */
  toString() {
    return new TableLayout(this, this.options).toString();
  }
  /** Write table to stdout. */
  render() {
    console.log(this.toString());
    return this;
  }
  /**
   * Set max column width.
   *
   * @param width     Max column width.
   * @param override  Override existing value.
   */
  maxColWidth(width, override = true) {
    if (override || typeof this.options.maxColWidth === "undefined") {
      this.options.maxColWidth = width;
    }
    return this;
  }
  /**
   * Set min column width.
   *
   * @param width     Min column width.
   * @param override  Override existing value.
   */
  minColWidth(width, override = true) {
    if (override || typeof this.options.minColWidth === "undefined") {
      this.options.minColWidth = width;
    }
    return this;
  }
  /**
   * Set table indentation.
   *
   * @param width     Indent width.
   * @param override  Override existing value.
   */
  indent(width, override = true) {
    if (override || typeof this.options.indent === "undefined") {
      this.options.indent = width;
    }
    return this;
  }
  /**
   * Set cell padding.
   *
   * @param padding   Cell padding.
   * @param override  Override existing value.
   */
  padding(padding3, override = true) {
    if (override || typeof this.options.padding === "undefined") {
      this.options.padding = padding3;
    }
    return this;
  }
  /**
   * Enable/disable cell border.
   *
   * @param enable    Enable/disable cell border.
   * @param override  Override existing value.
   */
  border(enable = true, override = true) {
    if (override || typeof this.options.border === "undefined") {
      this.options.border = enable;
    }
    return this;
  }
  /**
   * Align table content.
   *
   * @param direction Align direction.
   * @param override  Override existing value.
   */
  align(direction, override = true) {
    if (override || typeof this.options.align === "undefined") {
      this.options.align = direction;
    }
    return this;
  }
  /**
   * Set border characters.
   *
   * @param chars Border options.
   */
  chars(chars) {
    Object.assign(this.options.chars, chars);
    return this;
  }
  /** Get table header. */
  getHeader() {
    return this.headerRow;
  }
  /** Get table body. */
  getBody() {
    return [
      ...this
    ];
  }
  /** Get max column width. */
  getMaxColWidth() {
    return this.options.maxColWidth;
  }
  /** Get min column width. */
  getMinColWidth() {
    return this.options.minColWidth;
  }
  /** Get table indentation. */
  getIndent() {
    return this.options.indent;
  }
  /** Get cell padding. */
  getPadding() {
    return this.options.padding;
  }
  /** Check if table has border. */
  getBorder() {
    return this.options.border === true;
  }
  /** Check if header row has border. */
  hasHeaderBorder() {
    const hasBorder = this.headerRow?.hasBorder();
    return hasBorder === true || this.getBorder() && hasBorder !== false;
  }
  /** Check if table bordy has border. */
  hasBodyBorder() {
    return this.getBorder() || this.options.columns.some((column) => column.getBorder()) || this.some((row) => row instanceof Row ? row.hasBorder() : row.some((cell) => cell instanceof Cell ? cell.getBorder() : false));
  }
  /** Check if table header or body has border. */
  hasBorder() {
    return this.hasHeaderBorder() || this.hasBodyBorder();
  }
  /** Get table alignment. */
  getAlign() {
    return this.options.align ?? "left";
  }
  /** Get columns. */
  getColumns() {
    return this.options.columns;
  }
  /** Get column by column index. */
  getColumn(index) {
    return this.options.columns[index] ??= new Column();
  }
};

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/inspect.ts
function inspect(value, colors) {
  const { Deno: Deno4 } = globalThis;
  return Deno4?.inspect(value, {
    depth: 1,
    colors,
    trailingComma: false
  }) ?? JSON.stringify(value, null, 2);
}

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/type.ts
var Type = class {
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/help/_help_generator.ts
var HelpGenerator = class _HelpGenerator {
  cmd;
  indent;
  options;
  /** Generate help text for given command. */
  static generate(cmd, options) {
    return new _HelpGenerator(cmd, options).generate();
  }
  constructor(cmd, options = {}) {
    this.cmd = cmd;
    this.indent = 2;
    this.options = {
      types: false,
      hints: true,
      colors: true,
      long: false,
      ...options
    };
  }
  generate() {
    const areColorsEnabled = getColorEnabled();
    setColorEnabled(this.options.colors);
    const result = this.generateHeader() + this.generateMeta() + this.generateDescription() + this.generateOptions() + this.generateCommands() + this.generateEnvironmentVariables() + this.generateExamples();
    setColorEnabled(areColorsEnabled);
    return result;
  }
  generateHeader() {
    const usage = this.cmd.getUsage();
    const rows = [
      [
        bold("Usage:"),
        brightMagenta(this.cmd.getPath() + (usage ? " " + highlightArguments(usage, this.options.types) : ""))
      ]
    ];
    const version = this.cmd.getVersion();
    if (version) {
      rows.push([
        bold("Version:"),
        yellow(`${this.cmd.getVersion()}`)
      ]);
    }
    return "\n" + Table.from(rows).padding(1).toString() + "\n";
  }
  generateMeta() {
    const meta = Object.entries(this.cmd.getMeta());
    if (!meta.length) {
      return "";
    }
    const rows = [];
    for (const [name, value] of meta) {
      rows.push([
        bold(`${name}: `) + value
      ]);
    }
    return "\n" + Table.from(rows).padding(1).toString() + "\n";
  }
  generateDescription() {
    if (!this.cmd.getDescription()) {
      return "";
    }
    return this.label("Description") + Table.from([
      [
        dedent(this.cmd.getDescription())
      ]
    ]).indent(this.indent).maxColWidth(140).padding(1).toString() + "\n";
  }
  generateOptions() {
    const options = this.cmd.getOptions(false);
    if (!options.length) {
      return "";
    }
    let groups = [];
    const hasGroups = options.some((option) => option.groupName);
    if (hasGroups) {
      for (const option of options) {
        let group = groups.find((group2) => group2.name === option.groupName);
        if (!group) {
          group = {
            name: option.groupName,
            options: []
          };
          groups.push(group);
        }
        group.options.push(option);
      }
    } else {
      groups = [
        {
          name: "Options",
          options
        }
      ];
    }
    let result = "";
    for (const group of groups) {
      result += this.generateOptionGroup(group);
    }
    return result;
  }
  generateOptionGroup(group) {
    if (!group.options.length) {
      return "";
    }
    const hasTypeDefinitions = !!group.options.find((option) => !!option.typeDefinition);
    if (hasTypeDefinitions) {
      return this.label(group.name ?? "Options") + Table.from([
        ...group.options.map((option) => [
          option.flags.map((flag) => brightBlue(flag)).join(", "),
          highlightArguments(option.typeDefinition || "", this.options.types),
          red(bold("-")),
          getDescription(option.description, !this.options.long),
          this.generateHints(option)
        ])
      ]).padding([
        2,
        2,
        1,
        2
      ]).indent(this.indent).maxColWidth([
        60,
        60,
        1,
        80,
        60
      ]).toString() + "\n";
    }
    return this.label(group.name ?? "Options") + Table.from([
      ...group.options.map((option) => [
        option.flags.map((flag) => brightBlue(flag)).join(", "),
        red(bold("-")),
        getDescription(option.description, !this.options.long),
        this.generateHints(option)
      ])
    ]).indent(this.indent).maxColWidth([
      60,
      1,
      80,
      60
    ]).padding([
      2,
      1,
      2
    ]).toString() + "\n";
  }
  generateCommands() {
    const commands = this.cmd.getCommands(false);
    if (!commands.length) {
      return "";
    }
    const hasTypeDefinitions = !!commands.find((command) => !!command.getArgsDefinition());
    if (hasTypeDefinitions) {
      return this.label("Commands") + Table.from([
        ...commands.map((command) => [
          [
            command.getName(),
            ...command.getAliases()
          ].map((name) => brightBlue(name)).join(", "),
          highlightArguments(command.getArgsDefinition() || "", this.options.types),
          red(bold("-")),
          command.getShortDescription()
        ])
      ]).indent(this.indent).maxColWidth([
        60,
        60,
        1,
        80
      ]).padding([
        2,
        2,
        1,
        2
      ]).toString() + "\n";
    }
    return this.label("Commands") + Table.from([
      ...commands.map((command) => [
        [
          command.getName(),
          ...command.getAliases()
        ].map((name) => brightBlue(name)).join(", "),
        red(bold("-")),
        command.getShortDescription()
      ])
    ]).maxColWidth([
      60,
      1,
      80
    ]).padding([
      2,
      1,
      2
    ]).indent(this.indent).toString() + "\n";
  }
  generateEnvironmentVariables() {
    const envVars = this.cmd.getEnvVars(false);
    if (!envVars.length) {
      return "";
    }
    return this.label("Environment variables") + Table.from([
      ...envVars.map((envVar) => [
        envVar.names.map((name) => brightBlue(name)).join(", "),
        highlightArgumentDetails(envVar.details, this.options.types),
        red(bold("-")),
        this.options.long ? dedent(envVar.description) : envVar.description.trim().split("\n", 1)[0],
        envVar.required ? `(${yellow(`required`)})` : ""
      ])
    ]).padding([
      2,
      2,
      1,
      2
    ]).indent(this.indent).maxColWidth([
      60,
      60,
      1,
      80,
      10
    ]).toString() + "\n";
  }
  generateExamples() {
    const examples = this.cmd.getExamples();
    if (!examples.length) {
      return "";
    }
    return this.label("Examples") + Table.from(examples.map((example) => [
      dim(bold(example.name)),
      dedent(example.description)
    ])).padding(1).indent(this.indent).maxColWidth(150).toString() + "\n";
  }
  generateHints(option) {
    if (!this.options.hints) {
      return "";
    }
    const hints = [];
    option.required && hints.push(yellow(`required`));
    if (typeof option.default !== "undefined") {
      const defaultValue = typeof option.default === "function" ? option.default() : option.default;
      if (typeof defaultValue !== "undefined") {
        hints.push(bold(`Default: `) + inspect(defaultValue, this.options.colors));
      }
    }
    option.depends?.length && hints.push(yellow(bold(`Depends: `)) + italic(option.depends.map(getFlag2).join(", ")));
    option.conflicts?.length && hints.push(red(bold(`Conflicts: `)) + italic(option.conflicts.map(getFlag2).join(", ")));
    const type = this.cmd.getType(option.args[0]?.type)?.handler;
    if (type instanceof Type) {
      const possibleValues = type.values?.(this.cmd, this.cmd.getParent());
      if (possibleValues?.length) {
        hints.push(bold(`Values: `) + possibleValues.map((value) => inspect(value, this.options.colors)).join(", "));
      }
    }
    if (hints.length) {
      return `(${hints.join(", ")})`;
    }
    return "";
  }
  label(label) {
    return "\n" + bold(`${label}:`) + "\n\n";
  }
};
function highlightArguments(argsDefinition, types = true) {
  if (!argsDefinition) {
    return "";
  }
  return parseArgumentsDefinition(argsDefinition, false, true).map((arg) => typeof arg === "string" ? arg : highlightArgumentDetails(arg, types)).join(" ");
}
function highlightArgumentDetails(arg, types = true) {
  let str2 = "";
  str2 += yellow(arg.optional ? "[" : "<");
  let name = "";
  name += arg.name;
  if (arg.variadic) {
    name += "...";
  }
  name = brightMagenta(name);
  str2 += name;
  if (types) {
    str2 += yellow(":");
    str2 += red(arg.type);
    if (arg.list) {
      str2 += green("[]");
    }
  }
  str2 += yellow(arg.optional ? "]" : ">");
  return str2;
}

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/types/boolean.ts
var BooleanType = class extends Type {
  /** Parse boolean type. */
  parse(type) {
    return boolean(type);
  }
  /** Complete boolean type. */
  complete() {
    return [
      "true",
      "false"
    ];
  }
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/types/string.ts
var StringType = class extends Type {
  /** Complete string type. */
  parse(type) {
    return string(type);
  }
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/types/file.ts
var FileType = class extends StringType {
  constructor() {
    super();
  }
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/types/integer.ts
var IntegerType = class extends Type {
  /** Parse integer type. */
  parse(type) {
    return integer(type);
  }
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/types/number.ts
var NumberType = class extends Type {
  /** Parse number type. */
  parse(type) {
    return number(type);
  }
};

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/upgrade/_check_version.ts
async function checkVersion(cmd) {
  const mainCommand = cmd.getMainCommand();
  const upgradeCommand = mainCommand.getCommand("upgrade");
  if (!isUpgradeCommand(upgradeCommand)) {
    return;
  }
  const latestVersion = await upgradeCommand.getLatestVersion();
  const currentVersion = mainCommand.getVersion();
  if (!currentVersion || currentVersion === latestVersion) {
    return;
  }
  const versionHelpText = `(New version available: ${latestVersion}. Run '${mainCommand.getName()} upgrade' to upgrade to the latest version!)`;
  mainCommand.version(`${currentVersion}  ${bold(yellow(versionHelpText))}`);
}
function isUpgradeCommand(command) {
  return command instanceof Command && "getLatestVersion" in command;
}

// deno:https://jsr.io/@cliffy/command/1.0.0-rc.8/command.ts
var Command = class _Command {
  types = /* @__PURE__ */ new Map();
  rawArgs = [];
  literalArgs = [];
  _name = "COMMAND";
  _parent;
  _globalParent;
  ver;
  desc = "";
  _usage;
  actionHandler;
  globalActionHandler;
  options = [];
  commands = /* @__PURE__ */ new Map();
  examples = [];
  envVars = [];
  aliases = [];
  completions = /* @__PURE__ */ new Map();
  cmd = this;
  argsDefinition;
  throwOnError = false;
  _allowEmpty = false;
  _stopEarly = false;
  defaultCommand;
  _useRawArgs = false;
  args = [];
  isHidden = false;
  isGlobal = false;
  hasDefaults = false;
  _versionOptions;
  _helpOptions;
  _versionOption;
  _helpOption;
  _help;
  _shouldExit;
  _meta = {};
  _groupName = null;
  _noGlobals = false;
  errorHandler;
  versionOption(flags, desc, opts) {
    this._versionOptions = flags === false ? flags : {
      flags,
      desc,
      opts: typeof opts === "function" ? {
        action: opts
      } : opts
    };
    return this;
  }
  helpOption(flags, desc, opts) {
    this._helpOptions = flags === false ? flags : {
      flags,
      desc,
      opts: typeof opts === "function" ? {
        action: opts
      } : opts
    };
    return this;
  }
  /**
   * Add new sub-command.
   * @param nameAndArguments  Command definition. E.g: `my-command <input-file:string> <output-file:string>`
   * @param cmdOrDescription  The description of the new child command.
   * @param override          Override existing child command.
   */
  command(nameAndArguments, cmdOrDescription, override) {
    this.reset();
    const result = splitArguments(nameAndArguments);
    const name = result.flags.shift();
    const aliases = result.flags;
    if (!name) {
      throw new MissingCommandNameError();
    }
    if (this.getBaseCommand(name, true)) {
      if (!override) {
        throw new DuplicateCommandNameError(name);
      }
      this.removeCommand(name);
    }
    let description;
    let cmd;
    if (typeof cmdOrDescription === "string") {
      description = cmdOrDescription;
    }
    if (cmdOrDescription instanceof _Command) {
      cmd = cmdOrDescription.reset();
    } else {
      cmd = new _Command();
    }
    cmd._name = name;
    cmd._parent = this;
    if (description) {
      cmd.description(description);
    }
    if (result.typeDefinition) {
      cmd.arguments(result.typeDefinition);
    }
    aliases.forEach((alias) => cmd.alias(alias));
    this.commands.set(name, cmd);
    this.select(name);
    return this;
  }
  /**
   * Add new command alias.
   *
   * @param alias Tha name of the alias.
   */
  alias(alias) {
    if (this.cmd._name === alias || this.cmd.aliases.includes(alias)) {
      throw new DuplicateCommandAliasError(alias);
    }
    this.cmd.aliases.push(alias);
    return this;
  }
  /** Reset internal command reference to main command. */
  reset() {
    this._groupName = null;
    this.cmd = this;
    return this;
  }
  /**
   * Set internal command pointer to child command with given name.
   * @param name The name of the command to select.
   */
  select(name) {
    const cmd = this.getBaseCommand(name, true);
    if (!cmd) {
      throw new CommandNotFoundError(name, this.getBaseCommands(true));
    }
    this.cmd = cmd;
    return this;
  }
  /*****************************************************************************
   **** SUB HANDLER ************************************************************
   *****************************************************************************/
  /** Set command name. Used in auto generated help and shell completions */
  name(name) {
    this.cmd._name = name;
    return this;
  }
  /**
   * Set command version.
   *
   * @param version Semantic version string string or method that returns the version string.
   */
  version(version) {
    if (typeof version === "string") {
      this.cmd.ver = () => version;
    } else if (typeof version === "function") {
      this.cmd.ver = version;
    }
    return this;
  }
  /**
   * Add meta data. Will be displayed in the auto generated help and in the
   * output of the long version.
   *
   * @param name  The name/label of the metadata.
   * @param value The value of the metadata.
   */
  meta(name, value) {
    this.cmd._meta[name] = value;
    return this;
  }
  getMeta(name) {
    return typeof name === "undefined" ? this._meta : this._meta[name];
  }
  /**
   * Set command help.
   *
   * @param help Help string, method, or config for generator that returns the help string.
   */
  help(help) {
    if (typeof help === "string") {
      this.cmd._help = () => help;
    } else if (typeof help === "function") {
      this.cmd._help = help;
    } else {
      this.cmd._help = (cmd, options) => HelpGenerator.generate(cmd, {
        ...help,
        ...options
      });
    }
    return this;
  }
  /**
   * Set the long command description.
   *
   * @param description The command description.
   */
  description(description) {
    this.cmd.desc = description;
    return this;
  }
  /**
   * Set the command usage. Defaults to arguments.
   *
   * @param usage The command usage.
   */
  usage(usage) {
    this.cmd._usage = usage;
    return this;
  }
  /** Hide command from help, completions, etc. */
  hidden() {
    this.cmd.isHidden = true;
    return this;
  }
  /** Make command globally available. */
  global() {
    this.cmd.isGlobal = true;
    return this;
  }
  /**
   * Set command arguments.
   *
   * Syntax: `<requiredArg:string> [optionalArg: number] [...restArgs:string]`
   */
  arguments(args) {
    this.cmd.argsDefinition = args;
    return this;
  }
  /**
   * Set command callback method.
   *
   * @param fn Command action handler.
   */
  action(fn) {
    this.cmd.actionHandler = fn;
    return this;
  }
  /**
   * Set command callback method.
   *
   * @param fn Command action handler.
   */
  globalAction(fn) {
    this.cmd.globalActionHandler = fn;
    return this;
  }
  /**
   * Don't throw an error if the command was called without arguments.
   *
   * @param allowEmpty Enable/disable allow empty.
   */
  allowEmpty(allowEmpty) {
    this.cmd._allowEmpty = allowEmpty !== false;
    return this;
  }
  /**
   * Enable stop early. If enabled, all arguments starting from the first non
   * option argument will be passed as arguments with type string to the command
   * action handler.
   *
   * For example:
   *     `command --debug-level warning server --port 80`
   *
   * Will result in:
   *     - options: `{ debugLevel: 'warning' }`
   *     - args: `['server', '--port', '80']`
   *
   * @param stopEarly Enable/disable stop early.
   */
  stopEarly(stopEarly = true) {
    this.cmd._stopEarly = stopEarly;
    return this;
  }
  /**
   * Disable parsing arguments. If enabled the raw arguments will be passed to
   * the action handler. This has no effect for parent or child commands. Only
   * for the command on which this method was called.
   *
   * @param useRawArgs Enable/disable raw arguments.
   */
  useRawArgs(useRawArgs = true) {
    this.cmd._useRawArgs = useRawArgs;
    return this;
  }
  /**
   * Set default command. The default command is executed when the program
   * was called without any argument and if no action handler is registered.
   *
   * @param name Name of the default command.
   */
  default(name) {
    this.cmd.defaultCommand = name;
    return this;
  }
  globalType(name, handler, options) {
    return this.type(name, handler, {
      ...options,
      global: true
    });
  }
  /**
   * Register custom type.
   *
   * @param name    The name of the type.
   * @param handler The callback method to parse the type.
   * @param options Type options.
   */
  type(name, handler, options) {
    if (this.cmd.types.get(name) && !options?.override) {
      throw new DuplicateTypeError(name);
    }
    this.cmd.types.set(name, {
      ...options,
      name,
      handler
    });
    if (handler instanceof Type && (typeof handler.complete !== "undefined" || typeof handler.values !== "undefined")) {
      const completeHandler = (cmd, parent) => handler.complete?.(cmd, parent) || [];
      this.complete(name, completeHandler, options);
    }
    return this;
  }
  /**
   * Register global complete handler.
   *
   * @param name      The name of the completion.
   * @param complete  The callback method to complete the type.
   * @param options   Complete options.
   */
  globalComplete(name, complete, options) {
    return this.complete(name, complete, {
      ...options,
      global: true
    });
  }
  complete(name, complete, options) {
    if (this.cmd.completions.has(name) && !options?.override) {
      throw new DuplicateCompletionError(name);
    }
    this.cmd.completions.set(name, {
      name,
      complete,
      ...options
    });
    return this;
  }
  /**
   * Throw validation errors instead of calling `exit()` to handle
   * validation errors manually.
   *
   * A validation error is thrown when the command is wrongly used by the user.
   * For example: If the user passes some invalid options or arguments to the
   * command.
   *
   * This has no effect for parent commands. Only for the command on which this
   * method was called and all child commands.
   *
   * **Example:**
   *
   * ```ts
   * import { Command, ValidationError } from "./mod.ts";
   *
   * const cmd = new Command();
   * // ...
   *
   * try {
   *   cmd.parse();
   * } catch(error) {
   *   if (error instanceof ValidationError) {
   *     cmd.showHelp();
   *     Deno.exit(1);
   *   }
   *   throw error;
   * }
   * ```
   *
   * @see ValidationError
   */
  throwErrors() {
    this.cmd.throwOnError = true;
    return this;
  }
  /**
   * Set custom error handler.
   *
   * @param handler Error handler callback function.
   */
  error(handler) {
    this.cmd.errorHandler = handler;
    return this;
  }
  /** Get error handler callback function. */
  getErrorHandler() {
    return this.errorHandler ?? this._parent?.errorHandler;
  }
  /**
   * Same as `.throwErrors()` but also prevents calling `exit()` after
   * printing help or version with the --help and --version option.
   */
  noExit() {
    this.cmd._shouldExit = false;
    this.throwErrors();
    return this;
  }
  /**
   * Disable inheriting global commands, options and environment variables from
   * parent commands.
   */
  noGlobals() {
    this.cmd._noGlobals = true;
    return this;
  }
  /** Check whether the command should throw errors or exit. */
  shouldThrowErrors() {
    return this.throwOnError || !!this._parent?.shouldThrowErrors();
  }
  /** Check whether the command should exit after printing help or version. */
  shouldExit() {
    return this._shouldExit ?? this._parent?.shouldExit() ?? true;
  }
  /**
   * Enable grouping of options and set the name of the group.
   * All option which are added after calling the `.group()` method will be
   * grouped in the help output. If the `.group()` method can be use multiple
   * times to create more groups.
   *
   * @param name The name of the option group.
   */
  group(name) {
    this.cmd._groupName = name;
    return this;
  }
  /**
   * Register a global option.
   *
   * @param flags Flags string e.g: -h, --help, --manual <requiredArg:string> [optionalArg:number] [...restArgs:string]
   * @param desc Flag description.
   * @param opts Flag options or custom handler for processing flag value.
   */
  globalOption(flags, desc, opts) {
    if (typeof opts === "function") {
      return this.option(flags, desc, {
        value: opts,
        global: true
      });
    }
    return this.option(flags, desc, {
      ...opts,
      global: true
    });
  }
  option(flags, desc, opts) {
    if (typeof opts === "function") {
      opts = {
        value: opts
      };
    }
    const result = splitArguments(flags);
    const args = result.typeDefinition ? parseArgumentsDefinition(result.typeDefinition) : [];
    const option = {
      ...opts,
      name: "",
      description: desc,
      args,
      flags: result.flags,
      equalsSign: result.equalsSign,
      typeDefinition: result.typeDefinition,
      groupName: this._groupName ?? void 0
    };
    if (option.separator) {
      for (const arg of args) {
        if (arg.list) {
          arg.separator = option.separator;
        }
      }
    }
    for (const part of option.flags) {
      const arg = part.trim();
      const isLong = /^--/.test(arg);
      const name = isLong ? arg.slice(2) : arg.slice(1);
      if (this.cmd.getBaseOption(name, true)) {
        if (opts?.override) {
          this.removeOption(name);
        } else {
          throw new DuplicateOptionNameError(name, this.getPath());
        }
      }
      if (!option.name && isLong) {
        option.name = name;
      } else if (!option.aliases) {
        option.aliases = [
          name
        ];
      } else {
        option.aliases.push(name);
      }
    }
    if (option.prepend) {
      this.cmd.options.unshift(option);
    } else {
      this.cmd.options.push(option);
    }
    return this;
  }
  /**
   * Register command example.
   *
   * @param name          Name of the example.
   * @param description   The content of the example.
   */
  example(name, description) {
    if (this.cmd.hasExample(name)) {
      throw new DuplicateExampleError(name);
    }
    this.cmd.examples.push({
      name,
      description
    });
    return this;
  }
  /**
   * @param flags Flags string e.g: -h, --help, --manual <requiredArg:string> [optionalArg:number] [...restArgs:string]
   * @param desc Flag description.
   * @param opts Flag options or custom handler for processing flag value.
   */
  /**
  * Register a global environment variable.
  *
  * @param name        Name of the environment variable.
  * @param description The description of the environment variable.
  * @param options     Environment variable options.
  */
  globalEnv(name, description, options) {
    return this.env(name, description, {
      ...options,
      global: true
    });
  }
  env(name, description, options) {
    const result = splitArguments(name);
    if (!result.typeDefinition) {
      result.typeDefinition = "<value:boolean>";
    }
    if (result.flags.some((envName) => this.cmd.getBaseEnvVar(envName, true))) {
      throw new DuplicateEnvVarError(name);
    }
    const details = parseArgumentsDefinition(result.typeDefinition);
    if (details.length > 1) {
      throw new TooManyEnvVarValuesError(name);
    } else if (details.length && details[0].optional) {
      throw new UnexpectedOptionalEnvVarValueError(name);
    } else if (details.length && details[0].variadic) {
      throw new UnexpectedVariadicEnvVarValueError(name);
    }
    this.cmd.envVars.push({
      name: result.flags[0],
      names: result.flags,
      description,
      type: details[0].type,
      details: details.shift(),
      ...options
    });
    return this;
  }
  /*****************************************************************************
   **** MAIN HANDLER ***********************************************************
   *****************************************************************************/
  /**
  * Parse command line arguments and execute matched command.
  *
  * @param args Command line args to parse. Ex: `cmd.parse( Deno.args )`
  */
  parse(args = getArgs()) {
    const ctx = {
      unknown: args.slice(),
      flags: {},
      env: {},
      literal: [],
      stopEarly: false,
      stopOnUnknown: false,
      defaults: {},
      actions: []
    };
    return this.parseCommand(ctx);
  }
  async parseCommand(ctx) {
    try {
      this.reset();
      this.registerDefaults();
      this.rawArgs = ctx.unknown.slice();
      if (this._useRawArgs) {
        await this.parseEnvVars(ctx, this.envVars);
        return await this.execute(ctx.env, ctx.unknown);
      }
      let preParseGlobals = false;
      let subCommand;
      if (ctx.unknown.length > 0) {
        subCommand = this.getSubCommand(ctx);
        if (!subCommand) {
          const optionName = ctx.unknown[0].replace(/^-+/, "").split("=")[0];
          const option = this.getOption(optionName, true);
          if (option?.global) {
            preParseGlobals = true;
            await this.parseGlobalOptionsAndEnvVars(ctx);
          }
        }
      }
      if (subCommand || ctx.unknown.length > 0) {
        subCommand ??= this.getSubCommand(ctx);
        if (subCommand) {
          subCommand._globalParent = this;
          return subCommand.parseCommand(ctx);
        }
      }
      await this.parseOptionsAndEnvVars(ctx, preParseGlobals);
      const options = {
        ...ctx.env,
        ...ctx.flags
      };
      const args = this.parseArguments(ctx, options);
      this.literalArgs = ctx.literal;
      if (ctx.actions.length) {
        await Promise.all(ctx.actions.map((action) => action.call(this, options, ...args)));
        if (ctx.standalone) {
          return {
            options,
            args,
            cmd: this,
            literal: this.literalArgs
          };
        }
      }
      return await this.execute(options, args);
    } catch (error) {
      this.handleError(error);
    }
  }
  getSubCommand(ctx) {
    const subCommand = this.getCommand(ctx.unknown[0], true);
    if (subCommand) {
      ctx.unknown.shift();
    }
    return subCommand;
  }
  async parseGlobalOptionsAndEnvVars(ctx) {
    const isHelpOption = this.getHelpOption()?.flags.includes(ctx.unknown[0]);
    const envVars = [
      ...this.envVars.filter((envVar) => envVar.global),
      ...this.getGlobalEnvVars(true)
    ];
    await this.parseEnvVars(ctx, envVars, !isHelpOption);
    const options = [
      ...this.options.filter((option) => option.global),
      ...this.getGlobalOptions(true)
    ];
    this.parseOptions(ctx, options, {
      stopEarly: true,
      stopOnUnknown: true,
      dotted: false
    });
  }
  async parseOptionsAndEnvVars(ctx, preParseGlobals) {
    const helpOption = this.getHelpOption();
    const isVersionOption = this._versionOption?.flags.includes(ctx.unknown[0]);
    const isHelpOption = helpOption && ctx.flags?.[helpOption.name] === true;
    const envVars = preParseGlobals ? this.envVars.filter((envVar) => !envVar.global) : this.getEnvVars(true);
    await this.parseEnvVars(ctx, envVars, !isHelpOption && !isVersionOption);
    const options = this.getOptions(true);
    this.parseOptions(ctx, options);
  }
  /** Register default options like `--version` and `--help`. */
  registerDefaults() {
    if (this.hasDefaults || this.getParent()) {
      return this;
    }
    this.hasDefaults = true;
    this.reset();
    !this.types.has("string") && this.type("string", new StringType(), {
      global: true
    });
    !this.types.has("number") && this.type("number", new NumberType(), {
      global: true
    });
    !this.types.has("integer") && this.type("integer", new IntegerType(), {
      global: true
    });
    !this.types.has("boolean") && this.type("boolean", new BooleanType(), {
      global: true
    });
    !this.types.has("file") && this.type("file", new FileType(), {
      global: true
    });
    if (!this._help) {
      this.help({});
    }
    if (this._versionOptions !== false && (this._versionOptions || this.ver)) {
      this.option(this._versionOptions?.flags || "-V, --version", this._versionOptions?.desc || "Show the version number for this program.", {
        standalone: true,
        prepend: true,
        action: async function() {
          const long = this.getRawArgs().includes(`--${this._versionOption?.name}`);
          if (long) {
            await checkVersion(this);
            this.showLongVersion();
          } else {
            this.showVersion();
          }
          this.exit();
        },
        ...this._versionOptions?.opts ?? {}
      });
      this._versionOption = this.options[0];
    }
    if (this._helpOptions !== false) {
      this.option(this._helpOptions?.flags || "-h, --help", this._helpOptions?.desc || "Show this help.", {
        standalone: true,
        global: true,
        prepend: true,
        action: async function() {
          const long = this.getRawArgs().includes(`--${this.getHelpOption()?.name}`);
          await checkVersion(this);
          this.showHelp({
            long
          });
          this.exit();
        },
        ...this._helpOptions?.opts ?? {}
      });
      this._helpOption = this.options[0];
    }
    return this;
  }
  /**
   * Execute command.
   * @param options A map of options.
   * @param args Command arguments.
   */
  async execute(options, args) {
    if (this.defaultCommand) {
      const cmd = this.getCommand(this.defaultCommand, true);
      if (!cmd) {
        throw new DefaultCommandNotFoundError(this.defaultCommand, this.getCommands());
      }
      cmd._globalParent = this;
      return cmd.execute(options, args);
    }
    await this.executeGlobalAction(options, args);
    if (this.actionHandler) {
      await this.actionHandler(options, ...args);
    }
    return {
      options,
      args,
      cmd: this,
      literal: this.literalArgs
    };
  }
  async executeGlobalAction(options, args) {
    if (!this._noGlobals) {
      await this._parent?.executeGlobalAction(options, args);
    }
    await this.globalActionHandler?.(options, ...args);
  }
  /** Parse raw command line arguments. */
  parseOptions(ctx, options, { stopEarly = this._stopEarly, stopOnUnknown = false, dotted = true } = {}) {
    parseFlags(ctx, {
      stopEarly,
      stopOnUnknown,
      dotted,
      allowEmpty: this._allowEmpty,
      flags: options,
      ignoreDefaults: ctx.env,
      parse: (type) => this.parseType(type),
      option: (option) => {
        if (option.action) {
          ctx.actions.push(option.action);
        }
      }
    });
  }
  /** Parse argument type. */
  parseType(type) {
    const typeSettings = this.getType(type.type);
    if (!typeSettings) {
      throw new UnknownTypeError(type.type, this.getTypes().map((type2) => type2.name));
    }
    return typeSettings.handler instanceof Type ? typeSettings.handler.parse(type) : typeSettings.handler(type);
  }
  /**
   * Read and validate environment variables.
   * @param ctx Parse context.
   * @param envVars env vars defined by the command.
   * @param validate when true, throws an error if a required env var is missing.
   */
  async parseEnvVars(ctx, envVars, validate = true) {
    for (const envVar of envVars) {
      const env = await this.findEnvVar(envVar.names);
      if (env) {
        const parseType = (value) => {
          return this.parseType({
            label: "Environment variable",
            type: envVar.type,
            name: env.name,
            value
          });
        };
        const propertyName = underscoreToCamelCase(envVar.prefix ? envVar.names[0].replace(new RegExp(`^${envVar.prefix}`), "") : envVar.names[0]);
        if (envVar.details.list) {
          ctx.env[propertyName] = env.value.split(envVar.details.separator ?? ",").map(parseType);
        } else {
          ctx.env[propertyName] = parseType(env.value);
        }
        if (envVar.value && typeof ctx.env[propertyName] !== "undefined") {
          ctx.env[propertyName] = envVar.value(ctx.env[propertyName]);
        }
      } else if (envVar.required && validate) {
        throw new MissingRequiredEnvVarError(envVar);
      }
    }
  }
  async findEnvVar(names) {
    for (const name of names) {
      const status = await globalThis.Deno?.permissions.query({
        name: "env",
        variable: name
      });
      if (!status || status.state === "granted") {
        const value = getEnv(name);
        if (value) {
          return {
            name,
            value
          };
        }
      }
    }
    return void 0;
  }
  /**
   * Parse command-line arguments.
   * @param ctx     Parse context.
   * @param options Parsed command line options.
   */
  parseArguments(ctx, options) {
    const params = [];
    const args = ctx.unknown.slice();
    if (!this.hasArguments()) {
      if (args.length) {
        if (this.hasCommands(true)) {
          if (this.hasCommand(args[0], true)) {
            throw new TooManyArgumentsError(args);
          } else {
            throw new UnknownCommandError(args[0], this.getCommands());
          }
        } else {
          throw new NoArgumentsAllowedError(this.getPath());
        }
      }
    } else {
      if (!args.length) {
        const required = this.getArguments().filter((expectedArg) => !expectedArg.optional).map((expectedArg) => expectedArg.name);
        if (required.length) {
          const optionNames = Object.keys(options);
          const hasStandaloneOption = !!optionNames.find((name) => this.getOption(name, true)?.standalone);
          if (!hasStandaloneOption) {
            throw new MissingArgumentsError(required);
          }
        }
      } else {
        for (const expectedArg of this.getArguments()) {
          if (!args.length) {
            if (expectedArg.optional) {
              break;
            }
            throw new MissingArgumentError(expectedArg.name);
          }
          let arg;
          const parseArgValue = (value) => {
            return expectedArg.list ? value.split(",").map((value2) => parseArgType(value2)) : parseArgType(value);
          };
          const parseArgType = (value) => {
            return this.parseType({
              label: "Argument",
              type: expectedArg.type,
              name: expectedArg.name,
              value
            });
          };
          if (expectedArg.variadic) {
            arg = args.splice(0, args.length).map((value) => parseArgValue(value));
          } else {
            arg = parseArgValue(args.shift());
          }
          if (expectedArg.variadic && Array.isArray(arg)) {
            params.push(...arg);
          } else if (typeof arg !== "undefined") {
            params.push(arg);
          }
        }
        if (args.length) {
          throw new TooManyArgumentsError(args);
        }
      }
    }
    return params;
  }
  handleError(error) {
    this.throw(error instanceof ValidationError ? new ValidationError2(error.message) : error instanceof Error ? error : new Error(`[non-error-thrown] ${error}`));
  }
  /**
   * Handle error. If `throwErrors` is enabled the error will be thrown,
   * otherwise a formatted error message will be printed and `exit(1)`
   * will be called. This will also trigger registered error handlers.
   *
   * @param error The error to handle.
   */
  throw(error) {
    if (error instanceof ValidationError2) {
      error.cmd = this;
    }
    this.getErrorHandler()?.(error, this);
    if (this.shouldThrowErrors() || !(error instanceof ValidationError2)) {
      throw error;
    }
    this.showHelp();
    console.error(red(`  ${bold("error")}: ${error.message}
`));
    exit(error instanceof ValidationError2 ? error.exitCode : 1);
  }
  /*****************************************************************************
   **** GETTER *****************************************************************
   *****************************************************************************/
  /** Get command name. */
  getName() {
    return this._name;
  }
  /** Get parent command. */
  getParent() {
    return this._parent;
  }
  /**
   * Get parent command from global executed command.
   * Be sure, to call this method only inside an action handler. Unless this or any child command was executed,
   * this method returns always undefined.
   */
  getGlobalParent() {
    return this._globalParent;
  }
  /** Get main command. */
  getMainCommand() {
    return this._parent?.getMainCommand() ?? this;
  }
  /** Get command name aliases. */
  getAliases() {
    return this.aliases;
  }
  /**
   * Get full command path.
   *
   * @param name Override the main command name.
   */
  getPath(name) {
    return this._parent ? this._parent.getPath(name) + " " + this._name : name || this._name;
  }
  /** Get arguments definition. E.g: <input-file:string> <output-file:string> */
  getArgsDefinition() {
    return this.argsDefinition;
  }
  /**
   * Get argument by name.
   *
   * @param name Name of the argument.
   */
  getArgument(name) {
    return this.getArguments().find((arg) => arg.name === name);
  }
  /** Get arguments. */
  getArguments() {
    if (!this.args.length && this.argsDefinition) {
      this.args = parseArgumentsDefinition(this.argsDefinition);
    }
    return this.args;
  }
  /** Check if command has arguments. */
  hasArguments() {
    return !!this.argsDefinition;
  }
  /** Get command version. */
  getVersion() {
    return this.getVersionHandler()?.call(this, this);
  }
  /** Get help handler method. */
  getVersionHandler() {
    return this.ver ?? this._parent?.getVersionHandler();
  }
  /** Get command description. */
  getDescription() {
    return typeof this.desc === "function" ? this.desc = this.desc() : this.desc;
  }
  /** Get auto generated command usage. */
  getUsage() {
    return this._usage ?? [
      this.getArgsDefinition(),
      this.getRequiredOptionsDefinition()
    ].join(" ").trim();
  }
  getRequiredOptionsDefinition() {
    return this.getOptions().filter((option) => option.required).map((option) => [
      findFlag(option.flags),
      option.typeDefinition
    ].filter((v) => v).join(" ").trim()).join(" ");
  }
  /** Get short command description. This is the first line of the description. */
  getShortDescription() {
    return getDescription(this.getDescription(), true);
  }
  /** Get original command-line arguments. */
  getRawArgs() {
    return this.rawArgs;
  }
  /** Get all arguments defined after the double dash. */
  getLiteralArgs() {
    return this.literalArgs;
  }
  /** Output generated help without exiting. */
  showVersion() {
    console.log(this.getVersion());
  }
  /** Returns command name, version and meta data. */
  getLongVersion() {
    return `${bold(this.getMainCommand().getName())} ${brightBlue(this.getVersion() ?? "")}` + Object.entries(this.getMeta()).map(([k, v]) => `
${bold(k)} ${brightBlue(v)}`).join("");
  }
  /** Outputs command name, version and meta data. */
  showLongVersion() {
    console.log(this.getLongVersion());
  }
  /** Output generated help without exiting. */
  showHelp(options) {
    console.log(this.getHelp(options));
  }
  /** Get generated help. */
  getHelp(options) {
    this.registerDefaults();
    return this.getHelpHandler().call(this, this, options ?? {});
  }
  /** Get help handler method. */
  getHelpHandler() {
    return this._help ?? this._parent?.getHelpHandler();
  }
  exit(code2 = 0) {
    if (this.shouldExit()) {
      exit(code2);
    }
  }
  /*****************************************************************************
   **** Options GETTER *********************************************************
   *****************************************************************************/
  /**
  * Checks whether the command has options or not.
  *
  * @param hidden Include hidden options.
  */
  hasOptions(hidden) {
    return this.getOptions(hidden).length > 0;
  }
  /**
   * Get options.
   *
   * @param hidden Include hidden options.
   */
  getOptions(hidden) {
    return this.getGlobalOptions(hidden).concat(this.getBaseOptions(hidden));
  }
  /**
   * Get base options.
   *
   * @param hidden Include hidden options.
   */
  getBaseOptions(hidden) {
    if (!this.options.length) {
      return [];
    }
    return hidden ? this.options.slice(0) : this.options.filter((opt) => !opt.hidden);
  }
  /**
   * Get global options.
   *
   * @param hidden Include hidden options.
   */
  getGlobalOptions(hidden) {
    const helpOption = this.getHelpOption();
    const getGlobals = (cmd, noGlobals, options = [], names = []) => {
      if (cmd.options.length) {
        for (const option of cmd.options) {
          if (option.global && !this.options.find((opt) => opt.name === option.name) && names.indexOf(option.name) === -1 && (hidden || !option.hidden)) {
            if (noGlobals && option !== helpOption) {
              continue;
            }
            names.push(option.name);
            options.push(option);
          }
        }
      }
      return cmd._parent ? getGlobals(cmd._parent, noGlobals || cmd._noGlobals, options, names) : options;
    };
    return this._parent ? getGlobals(this._parent, this._noGlobals) : [];
  }
  /**
   * Checks whether the command has an option with given name or not.
   *
   * @param name Name of the option. Must be in param-case.
   * @param hidden Include hidden options.
   */
  hasOption(name, hidden) {
    return !!this.getOption(name, hidden);
  }
  /**
   * Get option by name.
   *
   * @param name Name of the option. Must be in param-case.
   * @param hidden Include hidden options.
   */
  getOption(name, hidden) {
    return this.getBaseOption(name, hidden) ?? this.getGlobalOption(name, hidden);
  }
  /**
   * Get base option by name.
   *
   * @param name Name of the option. Must be in param-case.
   * @param hidden Include hidden options.
   */
  getBaseOption(name, hidden) {
    const option = this.options.find((option2) => option2.name === name || option2.aliases?.includes(name));
    return option && (hidden || !option.hidden) ? option : void 0;
  }
  /**
   * Get global option from parent commands by name.
   *
   * @param name Name of the option. Must be in param-case.
   * @param hidden Include hidden options.
   */
  getGlobalOption(name, hidden) {
    const helpOption = this.getHelpOption();
    const getGlobalOption = (parent, noGlobals) => {
      const option = parent.getBaseOption(name, hidden);
      if (!option?.global) {
        return parent._parent && getGlobalOption(parent._parent, noGlobals || parent._noGlobals);
      }
      if (noGlobals && option !== helpOption) {
        return;
      }
      return option;
    };
    return this._parent && getGlobalOption(this._parent, this._noGlobals);
  }
  /**
   * Remove option by name.
   *
   * @param name Name of the option. Must be in param-case.
   */
  removeOption(name) {
    const index = this.options.findIndex((option) => option.name === name);
    if (index === -1) {
      return;
    }
    return this.options.splice(index, 1)[0];
  }
  /**
   * Checks whether the command has sub-commands or not.
   *
   * @param hidden Include hidden commands.
   */
  hasCommands(hidden) {
    return this.getCommands(hidden).length > 0;
  }
  /**
   * Get commands.
   *
   * @param hidden Include hidden commands.
   */
  getCommands(hidden) {
    return this.getGlobalCommands(hidden).concat(this.getBaseCommands(hidden));
  }
  /**
   * Get base commands.
   *
   * @param hidden Include hidden commands.
   */
  getBaseCommands(hidden) {
    const commands = Array.from(this.commands.values());
    return hidden ? commands : commands.filter((cmd) => !cmd.isHidden);
  }
  /**
   * Get global commands.
   *
   * @param hidden Include hidden commands.
   */
  getGlobalCommands(hidden) {
    const getCommands = (command, noGlobals, commands = [], names = []) => {
      if (command.commands.size) {
        for (const [_, cmd] of command.commands) {
          if (cmd.isGlobal && this !== cmd && !this.commands.has(cmd._name) && names.indexOf(cmd._name) === -1 && (hidden || !cmd.isHidden)) {
            if (noGlobals && cmd?.getName() !== "help") {
              continue;
            }
            names.push(cmd._name);
            commands.push(cmd);
          }
        }
      }
      return command._parent ? getCommands(command._parent, noGlobals || command._noGlobals, commands, names) : commands;
    };
    return this._parent ? getCommands(this._parent, this._noGlobals) : [];
  }
  /**
   * Checks whether a child command exists by given name or alias.
   *
   * @param name Name or alias of the command.
   * @param hidden Include hidden commands.
   */
  hasCommand(name, hidden) {
    return !!this.getCommand(name, hidden);
  }
  /**
   * Get command by name or alias.
   *
   * @param name Name or alias of the command.
   * @param hidden Include hidden commands.
   */
  getCommand(name, hidden) {
    return this.getBaseCommand(name, hidden) ?? this.getGlobalCommand(name, hidden);
  }
  /**
   * Get base command by name or alias.
   *
   * @param name Name or alias of the command.
   * @param hidden Include hidden commands.
   */
  getBaseCommand(name, hidden) {
    for (const cmd of this.commands.values()) {
      if (cmd._name === name || cmd.aliases.includes(name)) {
        return cmd && (hidden || !cmd.isHidden) ? cmd : void 0;
      }
    }
  }
  /**
   * Get global command by name or alias.
   *
   * @param name Name or alias of the command.
   * @param hidden Include hidden commands.
   */
  getGlobalCommand(name, hidden) {
    const getGlobalCommand = (parent, noGlobals) => {
      const cmd = parent.getBaseCommand(name, hidden);
      if (!cmd?.isGlobal) {
        return parent._parent && getGlobalCommand(parent._parent, noGlobals || parent._noGlobals);
      }
      if (noGlobals && cmd.getName() !== "help") {
        return;
      }
      return cmd;
    };
    return this._parent && getGlobalCommand(this._parent, this._noGlobals);
  }
  /**
   * Remove sub-command by name or alias.
   *
   * @param name Name or alias of the command.
   */
  removeCommand(name) {
    const command = this.getBaseCommand(name, true);
    if (command) {
      this.commands.delete(command._name);
    }
    return command;
  }
  /** Get types. */
  getTypes() {
    return this.getGlobalTypes().concat(this.getBaseTypes());
  }
  /** Get base types. */
  getBaseTypes() {
    return Array.from(this.types.values());
  }
  /** Get global types. */
  getGlobalTypes() {
    const getTypes = (cmd, types = [], names = []) => {
      if (cmd) {
        if (cmd.types.size) {
          cmd.types.forEach((type) => {
            if (type.global && !this.types.has(type.name) && names.indexOf(type.name) === -1) {
              names.push(type.name);
              types.push(type);
            }
          });
        }
        return getTypes(cmd._parent, types, names);
      }
      return types;
    };
    return getTypes(this._parent);
  }
  /**
   * Get type by name.
   *
   * @param name Name of the type.
   */
  getType(name) {
    return this.getBaseType(name) ?? this.getGlobalType(name);
  }
  /**
   * Get base type by name.
   *
   * @param name Name of the type.
   */
  getBaseType(name) {
    return this.types.get(name);
  }
  /**
   * Get global type by name.
   *
   * @param name Name of the type.
   */
  getGlobalType(name) {
    if (!this._parent) {
      return;
    }
    const cmd = this._parent.getBaseType(name);
    if (!cmd?.global) {
      return this._parent.getGlobalType(name);
    }
    return cmd;
  }
  /** Get completions. */
  getCompletions() {
    return this.getGlobalCompletions().concat(this.getBaseCompletions());
  }
  /** Get base completions. */
  getBaseCompletions() {
    return Array.from(this.completions.values());
  }
  /** Get global completions. */
  getGlobalCompletions() {
    const getCompletions = (cmd, completions = [], names = []) => {
      if (cmd) {
        if (cmd.completions.size) {
          cmd.completions.forEach((completion) => {
            if (completion.global && !this.completions.has(completion.name) && names.indexOf(completion.name) === -1) {
              names.push(completion.name);
              completions.push(completion);
            }
          });
        }
        return getCompletions(cmd._parent, completions, names);
      }
      return completions;
    };
    return getCompletions(this._parent);
  }
  /**
   * Get completion by name.
   *
   * @param name Name of the completion.
   */
  getCompletion(name) {
    return this.getBaseCompletion(name) ?? this.getGlobalCompletion(name);
  }
  /**
   * Get base completion by name.
   *
   * @param name Name of the completion.
   */
  getBaseCompletion(name) {
    return this.completions.get(name);
  }
  /**
   * Get global completions by name.
   *
   * @param name Name of the completion.
   */
  getGlobalCompletion(name) {
    if (!this._parent) {
      return;
    }
    const completion = this._parent.getBaseCompletion(name);
    if (!completion?.global) {
      return this._parent.getGlobalCompletion(name);
    }
    return completion;
  }
  /**
   * Checks whether the command has environment variables or not.
   *
   * @param hidden Include hidden environment variable.
   */
  hasEnvVars(hidden) {
    return this.getEnvVars(hidden).length > 0;
  }
  /**
   * Get environment variables.
   *
   * @param hidden Include hidden environment variable.
   */
  getEnvVars(hidden) {
    return this.getGlobalEnvVars(hidden).concat(this.getBaseEnvVars(hidden));
  }
  /**
   * Get base environment variables.
   *
   * @param hidden Include hidden environment variable.
   */
  getBaseEnvVars(hidden) {
    if (!this.envVars.length) {
      return [];
    }
    return hidden ? this.envVars.slice(0) : this.envVars.filter((env) => !env.hidden);
  }
  /**
   * Get global environment variables.
   *
   * @param hidden Include hidden environment variable.
   */
  getGlobalEnvVars(hidden) {
    if (this._noGlobals) {
      return [];
    }
    const getEnvVars = (cmd, envVars = [], names = []) => {
      if (cmd) {
        if (cmd.envVars.length) {
          cmd.envVars.forEach((envVar) => {
            if (envVar.global && !this.envVars.find((env) => env.names[0] === envVar.names[0]) && names.indexOf(envVar.names[0]) === -1 && (hidden || !envVar.hidden)) {
              names.push(envVar.names[0]);
              envVars.push(envVar);
            }
          });
        }
        return getEnvVars(cmd._parent, envVars, names);
      }
      return envVars;
    };
    return getEnvVars(this._parent);
  }
  /**
   * Checks whether the command has an environment variable with given name or not.
   *
   * @param name Name of the environment variable.
   * @param hidden Include hidden environment variable.
   */
  hasEnvVar(name, hidden) {
    return !!this.getEnvVar(name, hidden);
  }
  /**
   * Get environment variable by name.
   *
   * @param name Name of the environment variable.
   * @param hidden Include hidden environment variable.
   */
  getEnvVar(name, hidden) {
    return this.getBaseEnvVar(name, hidden) ?? this.getGlobalEnvVar(name, hidden);
  }
  /**
   * Get base environment variable by name.
   *
   * @param name Name of the environment variable.
   * @param hidden Include hidden environment variable.
   */
  getBaseEnvVar(name, hidden) {
    const envVar = this.envVars.find((env) => env.names.indexOf(name) !== -1);
    return envVar && (hidden || !envVar.hidden) ? envVar : void 0;
  }
  /**
   * Get global environment variable by name.
   *
   * @param name Name of the environment variable.
   * @param hidden Include hidden environment variable.
   */
  getGlobalEnvVar(name, hidden) {
    if (!this._parent || this._noGlobals) {
      return;
    }
    const envVar = this._parent.getBaseEnvVar(name, hidden);
    if (!envVar?.global) {
      return this._parent.getGlobalEnvVar(name, hidden);
    }
    return envVar;
  }
  /** Checks whether the command has examples or not. */
  hasExamples() {
    return this.examples.length > 0;
  }
  /** Get all examples. */
  getExamples() {
    return this.examples;
  }
  /** Checks whether the command has an example with given name or not. */
  hasExample(name) {
    return !!this.getExample(name);
  }
  /** Get example with given name. */
  getExample(name) {
    return this.examples.find((example) => example.name === name);
  }
  getHelpOption() {
    return this._helpOption ?? this._parent?.getHelpOption();
  }
};
function findFlag(flags) {
  for (const flag of flags) {
    if (flag.startsWith("--")) {
      return flag;
    }
  }
  return flags[0];
}

// node_modules/.deno/typescript-result@3.5.1/node_modules/typescript-result/dist/index.js
function isPromise(value) {
  if (value === null || value === void 0) {
    return false;
  }
  if (typeof value !== "object") {
    return false;
  }
  return value instanceof Promise || "then" in value;
}
function isFunction(value) {
  return typeof value === "function";
}
function isAsyncFn(fn) {
  return fn.constructor.name === "AsyncFunction";
}
function isGenerator(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.next === "function" && typeof obj.throw === "function" && typeof obj.return === "function" && typeof obj[Symbol.iterator] === "function" && obj[Symbol.iterator]() === obj;
}
function isAsyncGenerator(obj) {
  return typeof obj === "object" && obj !== null && typeof obj.next === "function" && typeof obj.throw === "function" && typeof obj.return === "function" && typeof obj[Symbol.asyncIterator] === "function" && obj[Symbol.asyncIterator]() === obj;
}
var NonExhaustiveError = class extends Error {
  constructor(error) {
    super("Not all error cases were handled");
    this.error = error;
  }
};
var Matcher = class {
  constructor(error) {
    this.error = error;
  }
  cases = [];
  defaultHandler = void 0;
  when(value, ...args) {
    const cases = [
      value,
      ...args.slice(0, -1)
    ];
    const handler = args.at(-1);
    this.cases.push(...cases.map((value2) => ({
      value: value2,
      handler
    })));
    return this;
  }
  else = (handler) => {
    if (this.defaultHandler) {
      throw new Error("already registered an 'else' handler");
    }
    this.defaultHandler = handler;
    return this;
  };
  run = () => {
    const isAsync = this.cases.some((item) => isAsyncFn(item.handler));
    for (const item of this.cases) {
      const match = isFunction(item.value) && this.error instanceof item.value || item.value === this.error;
      if (match) {
        const value = item.handler(this.error);
        return isPromise(value) ? value : isAsync ? Promise.resolve(value) : value;
      }
    }
    if (this.defaultHandler) {
      return this.defaultHandler(this.error);
    }
    throw new NonExhaustiveError(this.error);
  };
};
var AsyncResult = class _AsyncResult extends Promise {
  constructor(executor) {
    super(executor);
  }
  *[Symbol.iterator]() {
    return yield this;
  }
  get isAsyncResult() {
    return true;
  }
  async toTuple() {
    const result = await this;
    return result.toTuple();
  }
  async errorOrNull() {
    const result = await this;
    return result.errorOrNull();
  }
  async getOrNull() {
    const result = await this;
    return result.getOrNull();
  }
  async getOrDefault(defaultValue) {
    const result = await this;
    return result.getOrDefault(defaultValue);
  }
  async getOrElse(onFailure) {
    const result = await this;
    return result.getOrElse(onFailure);
  }
  async getOrThrow() {
    const result = await this;
    return result.getOrThrow();
  }
  async fold(onSuccess, onFailure) {
    const result = await this;
    return result.fold(onSuccess, onFailure);
  }
  onFailure(action) {
    return new _AsyncResult((resolve5, reject) => this.then(async (result) => {
      try {
        if (!result.ok) {
          await action(result.error);
        }
        resolve5(result);
      } catch (e) {
        reject(e);
      }
    }).catch(reject));
  }
  onSuccess(action) {
    return new _AsyncResult((resolve5, reject) => this.then(async (result) => {
      try {
        if (result.ok) {
          await action(result.value);
        }
        resolve5(result);
      } catch (error) {
        reject(error);
      }
    }).catch(reject));
  }
  map(transform) {
    return new _AsyncResult((resolve5, reject) => {
      this.then(async (result) => resolve5(await result.map(transform))).catch(reject);
    });
  }
  mapCatching(transformValue, transformError) {
    return new _AsyncResult((resolve5, reject) => {
      this.map(transformValue).then((result) => resolve5(result)).catch((error) => {
        try {
          resolve5(ResultFactory.error(transformError ? transformError(error) : error));
        } catch (err) {
          reject(err);
        }
      });
    });
  }
  mapError(transform) {
    return new _AsyncResult((resolve5, reject) => this.then(async (result) => {
      try {
        resolve5(result.mapError(transform));
      } catch (error) {
        reject(error);
      }
    }).catch(reject));
  }
  recover(onFailure) {
    return new _AsyncResult((resolve5, reject) => this.then(async (result) => {
      try {
        const outcome = await result.recover(onFailure);
        resolve5(outcome);
      } catch (error) {
        reject(error);
      }
    }).catch(reject));
  }
  recoverCatching(onFailure, transformError) {
    return new _AsyncResult((resolve5, reject) => this.then((result) => {
      resolve5(result.recoverCatching(onFailure, transformError));
    }).catch(reject));
  }
  toString() {
    return "AsyncResult";
  }
  static error(error) {
    return new _AsyncResult((resolve5) => resolve5(ResultFactory.error(error)));
  }
  static ok(value) {
    return new _AsyncResult((resolve5) => resolve5(ResultFactory.ok(value)));
  }
  static fromPromise(promise) {
    return new _AsyncResult((resolve5, reject) => {
      promise.then((value) => resolve5(ResultFactory.isResult(value) ? value : ResultFactory.ok(value))).catch(reject);
    });
  }
  static fromPromiseCatching(promise, transform) {
    return new _AsyncResult((resolve5) => {
      promise.then((value) => resolve5(ResultFactory.isResult(value) ? value : ResultFactory.ok(value))).catch((caughtError) => {
        resolve5(ResultFactory.error(transform?.(caughtError) ?? caughtError));
      });
    });
  }
};
var Result = class {
  constructor(_value, _error) {
    this._value = _value;
    this._error = _error;
  }
  *[Symbol.iterator]() {
    return yield this;
  }
  get isResult() {
    return true;
  }
  get value() {
    return this._value;
  }
  get error() {
    return this._error;
  }
  get success() {
    return this.error === void 0;
  }
  get failure() {
    return this.error !== void 0;
  }
  get ok() {
    return this.success;
  }
  isOk() {
    return this.success;
  }
  isError() {
    return this.failure;
  }
  toTuple() {
    return [
      this._value ?? null,
      this._error ?? null
    ];
  }
  errorOrNull() {
    return this.failure ? this._error : null;
  }
  getOrNull() {
    return this.success ? this._value : null;
  }
  getOrDefault(defaultValue) {
    return this.success ? this._value : defaultValue;
  }
  getOrElse(onFailure) {
    if (isAsyncFn(onFailure)) {
      return this.success ? Promise.resolve(this._value) : onFailure(this._error);
    }
    return this.success ? this._value : onFailure(this._error);
  }
  getOrThrow() {
    if (this.success) {
      return this._value;
    }
    throw this._error;
  }
  fold(onSuccess, onFailure) {
    const isAsync = isAsyncFn(onSuccess) || isAsyncFn(onFailure);
    const outcome = this.success ? onSuccess(this._value) : onFailure(this._error);
    return isAsync && !isPromise(outcome) ? Promise.resolve(outcome) : outcome;
  }
  match() {
    return this.failure ? new Matcher(this._error) : void 0;
  }
  onFailure(action) {
    const isAsync = isAsyncFn(action);
    if (this.failure) {
      const outcome = action(this._error);
      if (isAsync) {
        return new AsyncResult((resolve5) => {
          outcome.then(() => resolve5(ResultFactory.error(this._error)));
        });
      }
      return this;
    }
    return isAsync ? AsyncResult.ok(this._value) : this;
  }
  onSuccess(action) {
    const isAsync = isAsyncFn(action);
    if (this.success) {
      const outcome = action(this._value);
      if (isAsync) {
        return new AsyncResult((resolve5) => {
          outcome.then(() => resolve5(ResultFactory.ok(this._value)));
        });
      }
      return this;
    }
    return isAsync ? AsyncResult.error(this._error) : this;
  }
  map(transform) {
    return this.success ? ResultFactory.run(() => transform(this._value)) : isAsyncFn(transform) ? AsyncResult.error(this._error) : this;
  }
  mapCatching(transformValue, transformError) {
    return this.success ? ResultFactory.try(() => transformValue(this._value), transformError) : this;
  }
  mapError(transform) {
    if (this.success) {
      return this;
    }
    return ResultFactory.error(transform(this._error));
  }
  recover(onFailure) {
    return this.success ? isAsyncFn(onFailure) ? AsyncResult.ok(this._value) : this : ResultFactory.run(() => onFailure(this._error));
  }
  recoverCatching(onFailure, transformError) {
    return this.success ? isAsyncFn(onFailure) ? AsyncResult.ok(this._value) : this : ResultFactory.try(() => onFailure(this._error), transformError);
  }
  toString() {
    if (this.success) {
      return `Result.ok(${this._value})`;
    }
    return `Result.error(${this.error})`;
  }
};
var ResultFactory = class _ResultFactory {
  constructor() {
  }
  static ok(value) {
    return new Result(value, void 0);
  }
  static error(error) {
    return new Result(void 0, error);
  }
  static isResult(possibleResult) {
    return possibleResult instanceof Result;
  }
  static isAsyncResult(possibleAsyncResult) {
    return possibleAsyncResult instanceof AsyncResult;
  }
  static run(fn) {
    const returnValue = fn();
    if (isGenerator(returnValue) || isAsyncGenerator(returnValue)) {
      return _ResultFactory.handleGenerator(returnValue);
    }
    if (isPromise(returnValue)) {
      return AsyncResult.fromPromise(returnValue);
    }
    return _ResultFactory.isResult(returnValue) ? returnValue : _ResultFactory.ok(returnValue);
  }
  static allInternal(items, opts) {
    const runner = opts.catching ? _ResultFactory.try : _ResultFactory.run;
    const flattened = [];
    let isAsync = items.some(isPromise);
    let hasFailure = false;
    for (const item of items) {
      if (isFunction(item)) {
        if (hasFailure) {
          continue;
        }
        const returnValue = runner(item);
        if (_ResultFactory.isResult(returnValue) && !returnValue.ok) {
          hasFailure = true;
          if (!isAsync) {
            return returnValue;
          }
        }
        if (_ResultFactory.isAsyncResult(returnValue)) {
          isAsync = true;
        }
        flattened.push(returnValue);
      } else if (_ResultFactory.isResult(item)) {
        if (!item.ok) {
          hasFailure = true;
          if (!isAsync) {
            return item;
          }
        }
        flattened.push(item);
      } else if (_ResultFactory.isAsyncResult(item)) {
        isAsync = true;
        flattened.push(item);
      } else if (isPromise(item)) {
        isAsync = true;
        flattened.push(opts.catching ? AsyncResult.fromPromiseCatching(item) : AsyncResult.fromPromise(item));
      } else {
        flattened.push(_ResultFactory.ok(item));
      }
    }
    if (isAsync) {
      return new AsyncResult((resolve5, reject) => {
        const asyncResults = [];
        const asyncIndexes = [];
        for (let i = 0; i < flattened.length; i++) {
          const item = flattened[i];
          if (_ResultFactory.isAsyncResult(item)) {
            asyncResults.push(item);
            asyncIndexes.push(i);
          }
        }
        Promise.all(asyncResults).then((resolvedResults) => {
          const merged = [
            ...flattened
          ];
          for (let i = 0; i < resolvedResults.length; i++) {
            merged[asyncIndexes[i]] = resolvedResults[i];
          }
          const firstFailedResult = merged.find((resolvedResult) => !resolvedResult.ok);
          if (firstFailedResult) {
            resolve5(firstFailedResult);
            return;
          }
          resolve5(_ResultFactory.ok(merged.map((result) => result.getOrNull())));
        }).catch((reason) => {
          reject(reason);
        });
      });
    }
    return _ResultFactory.ok(flattened.map((result) => result.getOrNull()));
  }
  static all(...items) {
    return _ResultFactory.allInternal(items, {
      catching: false
    });
  }
  static allCatching(...items) {
    return _ResultFactory.allInternal(items, {
      catching: true
    });
  }
  static wrap(fn, transformError) {
    return function wrapped(...args) {
      return _ResultFactory.try(() => fn(...args), transformError);
    };
  }
  static try(fn, transform) {
    try {
      const returnValue = fn();
      if (isGenerator(returnValue)) {
        return _ResultFactory.handleGenerator(returnValue);
      }
      if (isAsyncGenerator(returnValue)) {
        const asyncResult = _ResultFactory.handleGenerator(returnValue);
        return AsyncResult.fromPromiseCatching(asyncResult, transform);
      }
      if (isPromise(returnValue)) {
        return AsyncResult.fromPromiseCatching(returnValue, transform);
      }
      return _ResultFactory.isResult(returnValue) ? returnValue : _ResultFactory.ok(returnValue);
    } catch (caughtError) {
      return _ResultFactory.error(transform?.(caughtError) ?? caughtError);
    }
  }
  static fromAsync(valueOrFn) {
    return _ResultFactory.run(typeof valueOrFn === "function" ? valueOrFn : () => valueOrFn);
  }
  static fromAsyncCatching(valueOrFn, transformError) {
    return _ResultFactory.try(typeof valueOrFn === "function" ? valueOrFn : () => valueOrFn, transformError);
  }
  static handleGenerator(it) {
    function handleResult(result2) {
      if (!result2.ok) {
        return iterate(it.return(result2));
      }
      return iterate(it.next(result2.value));
    }
    function handleStep(step) {
      if (step.done) {
        if (step.value instanceof Result || step.value instanceof AsyncResult) {
          return step.value;
        }
        return _ResultFactory.ok(step.value);
      }
      if (step.value instanceof Result) {
        return handleResult(step.value);
      }
      if (step.value instanceof AsyncResult) {
        return step.value.then(handleResult);
      }
      return iterate(it.next(step.value));
    }
    function iterate(iteratorResult) {
      return isPromise(iteratorResult) ? iteratorResult.then(handleStep) : handleStep(iteratorResult);
    }
    const result = iterate(it.next());
    return isPromise(result) ? AsyncResult.fromPromise(result) : result;
  }
  static gen(generatorOrSelfOrFn, fn) {
    const it = isGenerator(generatorOrSelfOrFn) || isAsyncGenerator(generatorOrSelfOrFn) ? generatorOrSelfOrFn : typeof generatorOrSelfOrFn === "function" ? generatorOrSelfOrFn() : fn?.apply(generatorOrSelfOrFn);
    return _ResultFactory.handleGenerator(it);
  }
  static genCatching(generatorOrSelfOrFn, transformValueOrError, transformError) {
    const isGen = isGenerator(generatorOrSelfOrFn) || isAsyncGenerator(generatorOrSelfOrFn);
    const self = typeof generatorOrSelfOrFn === "function" || isGen ? void 0 : generatorOrSelfOrFn;
    const tValue = typeof generatorOrSelfOrFn === "function" ? generatorOrSelfOrFn : transformValueOrError;
    const tError = typeof generatorOrSelfOrFn === "function" || isGen ? transformValueOrError : transformError;
    try {
      const it = isGen ? generatorOrSelfOrFn : self ? tValue.apply(generatorOrSelfOrFn) : tValue();
      const result = _ResultFactory.handleGenerator(it);
      if (_ResultFactory.isAsyncResult(result)) {
        return result.catch((error) => AsyncResult.error(tError?.(error) ?? error));
      }
      return result;
    } catch (error) {
      return _ResultFactory.error(tError?.(error) ?? error);
    }
  }
  static assertOk(result) {
    if (!result.ok) {
      throw new Error("Expected a successful result, but got an error instead");
    }
  }
  static assertError(result) {
    if (result.ok) {
      throw new Error("Expected a failed result, but got a value instead");
    }
  }
  static [Symbol.hasInstance](instance) {
    return instance instanceof Result;
  }
};
var Result2 = ResultFactory;

// deno:https://jsr.io/@std/assert/1.0.13/equal.ts
var Temporal = globalThis.Temporal ?? new Proxy({}, {
  get: () => {
  }
});
var stringComparablePrototypes = new Set([
  Intl.Locale,
  RegExp,
  Temporal.Duration,
  Temporal.Instant,
  Temporal.PlainDate,
  Temporal.PlainDateTime,
  Temporal.PlainTime,
  Temporal.PlainYearMonth,
  Temporal.PlainMonthDay,
  Temporal.ZonedDateTime,
  URL,
  URLSearchParams
].filter((x) => x != null).map((x) => x.prototype));
var TypedArray = Object.getPrototypeOf(Uint8Array);

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/get_os.ts
function getOs() {
  const { Deno: Deno4, process: process2 } = globalThis;
  if (Deno4) {
    return Deno4.build.os;
  } else if (process2) {
    return process2.platform;
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/_figures.ts
var main = {
  ARROW_UP: "\u2191",
  ARROW_DOWN: "\u2193",
  ARROW_LEFT: "\u2190",
  ARROW_RIGHT: "\u2192",
  ARROW_UP_LEFT: "\u2196",
  ARROW_UP_RIGHT: "\u2197",
  ARROW_DOWN_RIGHT: "\u2198",
  ARROW_DOWN_LEFT: "\u2199",
  RADIO_ON: "\u25C9",
  RADIO_OFF: "\u25EF",
  TICK: "\u2714",
  CROSS: "\u2718",
  ELLIPSIS: "\u2026",
  POINTER_SMALL: "\u203A",
  POINTER_SMALL_LEFT: "\u2039",
  LINE: "\u2500",
  POINTER: "\u276F",
  POINTER_LEFT: "\u276E",
  INFO: "\u2139",
  TAB_LEFT: "\u21E4",
  TAB_RIGHT: "\u21E5",
  ESCAPE: "\u238B",
  BACKSPACE: "\u232B",
  PAGE_UP: "\u21DE",
  PAGE_DOWN: "\u21DF",
  ENTER: "\u21B5",
  SEARCH: "\u{1F50E}",
  FOLDER: "\u{1F4C1}",
  FOLDER_OPEN: "\u{1F4C2}"
};
var win = {
  ...main,
  RADIO_ON: "(*)",
  RADIO_OFF: "( )",
  TICK: "\u221A",
  CROSS: "\xD7",
  POINTER_SMALL: "\xBB"
};
var Figures = getOs() === "windows" ? win : main;
var keyMap = {
  up: "ARROW_UP",
  down: "ARROW_DOWN",
  left: "ARROW_LEFT",
  right: "ARROW_RIGHT",
  pageup: "PAGE_UP",
  pagedown: "PAGE_DOWN",
  tab: "TAB_RIGHT",
  enter: "ENTER",
  return: "ENTER"
};
function getFiguresByKeys(keys) {
  const figures = [];
  for (const key of keys) {
    const figure = Figures[keyMap[key]] ?? key;
    if (!figures.includes(figure)) {
      figures.push(figure);
    }
  }
  return figures;
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/read_sync.ts
var { Deno: Deno3, process, Buffer: Buffer2 } = globalThis;
var { readSync: readSyncNode } = process ? await import("node:fs") : {
  readSync: null
};
function readSync(data2) {
  if (Deno3) {
    return Deno3.stdin.readSync(data2);
  } else if (readSyncNode) {
    const buffer = Buffer2.alloc(data2.byteLength);
    const bytesRead = readSyncNode(process.stdout.fd, buffer, 0, buffer.length, null);
    for (let i = 0; i < bytesRead; i++) {
      data2[i] = buffer[i];
    }
    return bytesRead;
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/set_raw.ts
function setRaw(mode, { cbreak } = {}) {
  const { Deno: Deno4, process: process2 } = globalThis;
  if (Deno4) {
    Deno4.stdin.setRaw(mode, {
      cbreak
    });
  } else if (process2) {
    process2.stdin.setRawMode(mode);
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/write_sync.ts
function writeSync(data2) {
  const { Deno: Deno4, process: process2 } = globalThis;
  if (Deno4) {
    return Deno4.stdout.writeSync(data2);
  } else if (process2) {
    process2.stdout.write(data2);
    return data2.byteLength;
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/ansi/1.0.0-rc.8/ansi_escapes.ts
var ansi_escapes_exports = {};
__export(ansi_escapes_exports, {
  bel: () => bel,
  clearScreen: () => clearScreen,
  clearTerminal: () => clearTerminal,
  cursorBackward: () => cursorBackward,
  cursorDown: () => cursorDown,
  cursorForward: () => cursorForward,
  cursorHide: () => cursorHide,
  cursorLeft: () => cursorLeft,
  cursorMove: () => cursorMove,
  cursorNextLine: () => cursorNextLine,
  cursorPosition: () => cursorPosition,
  cursorPrevLine: () => cursorPrevLine,
  cursorRestore: () => cursorRestore,
  cursorSave: () => cursorSave,
  cursorShow: () => cursorShow,
  cursorTo: () => cursorTo,
  cursorUp: () => cursorUp,
  eraseDown: () => eraseDown,
  eraseLine: () => eraseLine,
  eraseLineEnd: () => eraseLineEnd,
  eraseLineStart: () => eraseLineStart,
  eraseLines: () => eraseLines,
  eraseScreen: () => eraseScreen,
  eraseUp: () => eraseUp,
  image: () => image,
  link: () => link,
  scrollDown: () => scrollDown,
  scrollUp: () => scrollUp
});

// deno:https://jsr.io/@std/encoding/1.0.10/_common64.ts
var padding = "=".charCodeAt(0);
var alphabet = {
  base64: new TextEncoder().encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"),
  base64url: new TextEncoder().encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_")
};
var rAlphabet = {
  base64: new Uint8Array(128).fill(64),
  base64url: new Uint8Array(128).fill(64)
};
alphabet.base64.forEach((byte, i) => rAlphabet.base64[byte] = i);
alphabet.base64url.forEach((byte, i) => rAlphabet.base64url[byte] = i);
function calcSizeBase64(originalSize) {
  return ((originalSize + 2) / 3 | 0) * 4;
}
function encode(buffer, i, o, alphabet3, padding3) {
  i += 2;
  for (; i < buffer.length; i += 3) {
    const x = buffer[i - 2] << 16 | buffer[i - 1] << 8 | buffer[i];
    buffer[o++] = alphabet3[x >> 18];
    buffer[o++] = alphabet3[x >> 12 & 63];
    buffer[o++] = alphabet3[x >> 6 & 63];
    buffer[o++] = alphabet3[x & 63];
  }
  switch (i) {
    case buffer.length + 1: {
      const x = buffer[i - 2] << 16;
      buffer[o++] = alphabet3[x >> 18];
      buffer[o++] = alphabet3[x >> 12 & 63];
      buffer[o++] = padding3;
      buffer[o++] = padding3;
      break;
    }
    case buffer.length: {
      const x = buffer[i - 2] << 16 | buffer[i - 1] << 8;
      buffer[o++] = alphabet3[x >> 18];
      buffer[o++] = alphabet3[x >> 12 & 63];
      buffer[o++] = alphabet3[x >> 6 & 63];
      buffer[o++] = padding3;
      break;
    }
  }
  return o;
}

// deno:https://jsr.io/@std/encoding/1.0.10/_common_detach.ts
function detach(buffer, maxSize) {
  const originalSize = buffer.length;
  if (buffer.byteOffset) {
    const b = new Uint8Array(buffer.buffer);
    b.set(buffer);
    buffer = b.subarray(0, originalSize);
  }
  buffer = new Uint8Array(buffer.buffer.transfer(maxSize));
  buffer.set(buffer.subarray(0, originalSize), maxSize - originalSize);
  return [
    buffer,
    maxSize - originalSize
  ];
}

// deno:https://jsr.io/@std/encoding/1.0.10/base64.ts
var padding2 = "=".charCodeAt(0);
var alphabet2 = new TextEncoder().encode("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/");
var rAlphabet2 = new Uint8Array(128).fill(64);
alphabet2.forEach((byte, i) => rAlphabet2[byte] = i);
function encodeBase64(data2) {
  if (typeof data2 === "string") {
    data2 = new TextEncoder().encode(data2);
  } else if (data2 instanceof ArrayBuffer) data2 = new Uint8Array(data2).slice();
  else data2 = data2.slice();
  const [output, i] = detach(data2, calcSizeBase64(data2.length));
  encode(output, i, 0, alphabet2, padding2);
  return new TextDecoder().decode(output);
}

// deno:https://jsr.io/@cliffy/ansi/1.0.0-rc.8/ansi_escapes.ts
var ESC = "\x1B";
var CSI = `${ESC}[`;
var OSC = `${ESC}]`;
var SEP = ";";
var bel = "\x07";
var cursorPosition = `${CSI}6n`;
function cursorTo(x, y) {
  if (typeof y !== "number") {
    return `${CSI}${x}G`;
  }
  return `${CSI}${y};${x}H`;
}
function cursorMove(x, y) {
  let ret = "";
  if (x < 0) {
    ret += `${CSI}${-x}D`;
  } else if (x > 0) {
    ret += `${CSI}${x}C`;
  }
  if (y < 0) {
    ret += `${CSI}${-y}A`;
  } else if (y > 0) {
    ret += `${CSI}${y}B`;
  }
  return ret;
}
function cursorUp(count = 1) {
  return `${CSI}${count}A`;
}
function cursorDown(count = 1) {
  return `${CSI}${count}B`;
}
function cursorForward(count = 1) {
  return `${CSI}${count}C`;
}
function cursorBackward(count = 1) {
  return `${CSI}${count}D`;
}
function cursorNextLine(count = 1) {
  return `${CSI}E`.repeat(count);
}
function cursorPrevLine(count = 1) {
  return `${CSI}F`.repeat(count);
}
var cursorLeft = `${CSI}G`;
var cursorHide = `${CSI}?25l`;
var cursorShow = `${CSI}?25h`;
var cursorSave = `${ESC}7`;
var cursorRestore = `${ESC}8`;
function scrollUp(count = 1) {
  return `${CSI}S`.repeat(count);
}
function scrollDown(count = 1) {
  return `${CSI}T`.repeat(count);
}
var eraseScreen = `${CSI}2J`;
function eraseUp(count = 1) {
  return `${CSI}1J`.repeat(count);
}
function eraseDown(count = 1) {
  return `${CSI}0J`.repeat(count);
}
var eraseLine = `${CSI}2K`;
var eraseLineEnd = `${CSI}0K`;
var eraseLineStart = `${CSI}1K`;
function eraseLines(count) {
  let clear = "";
  for (let i = 0; i < count; i++) {
    clear += eraseLine + (i < count - 1 ? cursorUp() : "");
  }
  clear += cursorLeft;
  return clear;
}
var clearScreen = "\x1Bc";
var clearTerminal = getOs() === "windows" ? `${eraseScreen}${CSI}0f` : `${eraseScreen}${CSI}3J${CSI}H`;
function link(text, url) {
  return [
    OSC,
    "8",
    SEP,
    SEP,
    url,
    bel,
    text,
    OSC,
    "8",
    SEP,
    SEP,
    bel
  ].join("");
}
function image(buffer, options) {
  let ret = `${OSC}1337;File=inline=1`;
  if (options?.width) {
    ret += `;width=${options.width}`;
  }
  if (options?.height) {
    ret += `;height=${options.height}`;
  }
  if (options?.preserveAspectRatio === false) {
    ret += ";preserveAspectRatio=0";
  }
  return ret + ":" + encodeBase64(buffer) + bel;
}

// deno:https://jsr.io/@cliffy/ansi/1.0.0-rc.8/cursor_position.ts
var encoder = new TextEncoder();
var decoder = new TextDecoder();
function getCursorPosition({ reader = {
  readSync,
  setRaw
}, writer = {
  writeSync
} } = {}) {
  const data2 = new Uint8Array(8);
  reader.setRaw(true);
  writer.writeSync(encoder.encode(cursorPosition));
  reader.readSync(data2);
  reader.setRaw(false);
  const [y, x] = decoder.decode(data2).match(/\[(\d+);(\d+)R/)?.slice(1, 3).map(Number) ?? [
    0,
    0
  ];
  return {
    x,
    y
  };
}

// deno:https://jsr.io/@cliffy/ansi/1.0.0-rc.8/tty.ts
var tty = factory();
var encoder2 = new TextEncoder();
function factory(options) {
  let result = "";
  let stack = [];
  const writer = options?.writer ?? {
    writeSync
  };
  const reader = options?.reader ?? {
    readSync,
    setRaw
  };
  const tty2 = function(...args) {
    if (this) {
      update(args);
      writer.writeSync(encoder2.encode(result));
      return this;
    }
    return factory(args[0] ?? options);
  };
  tty2.text = function(text) {
    stack.push([
      text,
      []
    ]);
    update();
    writer.writeSync(encoder2.encode(result));
    return this;
  };
  tty2.getCursorPosition = () => getCursorPosition({
    writer,
    reader
  });
  const methodList = Object.entries(ansi_escapes_exports);
  for (const [name, method] of methodList) {
    if (name === "cursorPosition") {
      continue;
    }
    Object.defineProperty(tty2, name, {
      get() {
        stack.push([
          method,
          []
        ]);
        return this;
      }
    });
  }
  return tty2;
  function update(args) {
    if (!stack.length) {
      return;
    }
    if (args) {
      stack[stack.length - 1][1] = args;
    }
    result = stack.reduce((prev, [cur, args2]) => prev + (typeof cur === "string" ? cur : cur.call(tty2, ...args2)), "");
    stack = [];
  }
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/runtime_name.ts
function getRuntimeName() {
  switch (true) {
    case "Deno" in globalThis:
      return "deno";
    case "Bun" in globalThis:
      return "bun";
    case "process" in globalThis:
      return "node";
    default:
      throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/keycode/1.0.0-rc.8/_key_codes.ts
var KeyMap = {
  /* xterm/gnome ESC [ letter (with modifier) */
  "[P": "f1",
  "[Q": "f2",
  "[R": "f3",
  "[S": "f4",
  /* xterm/gnome ESC O letter (without modifier) */
  "OP": "f1",
  "OQ": "f2",
  "OR": "f3",
  "OS": "f4",
  /* xterm/rxvt ESC [ number ~ */
  "[11~": "f1",
  "[12~": "f2",
  "[13~": "f3",
  "[14~": "f4",
  /* from Cygwin and used in libuv */
  "[[A": "f1",
  "[[B": "f2",
  "[[C": "f3",
  "[[D": "f4",
  "[[E": "f5",
  /* common */
  "[15~": "f5",
  "[17~": "f6",
  "[18~": "f7",
  "[19~": "f8",
  "[20~": "f9",
  "[21~": "f10",
  "[23~": "f11",
  "[24~": "f12",
  /* xterm ESC [ letter */
  "[A": "up",
  "[B": "down",
  "[C": "right",
  "[D": "left",
  "[E": "clear",
  "[F": "end",
  "[H": "home",
  /* xterm/gnome ESC O letter */
  "OA": "up",
  "OB": "down",
  "OC": "right",
  "OD": "left",
  "OE": "clear",
  "OF": "end",
  "OH": "home",
  /* xterm/rxvt ESC [ number ~ */
  "[1~": "home",
  "[2~": "insert",
  "[3~": "delete",
  "[4~": "end",
  "[5~": "pageup",
  "[6~": "pagedown",
  /* putty */
  "[[5~": "pageup",
  "[[6~": "pagedown",
  /* rxvt */
  "[7~": "home",
  "[8~": "end"
};
var KeyMapShift = {
  /* rxvt keys with modifiers */
  "[a": "up",
  "[b": "down",
  "[c": "right",
  "[d": "left",
  "[e": "clear",
  "[2$": "insert",
  "[3$": "delete",
  "[5$": "pageup",
  "[6$": "pagedown",
  "[7$": "home",
  "[8$": "end",
  "[Z": "tab"
};
var KeyMapCtrl = {
  /* rxvt keys with modifiers */
  "Oa": "up",
  "Ob": "down",
  "Oc": "right",
  "Od": "left",
  "Oe": "clear",
  "[2^": "insert",
  "[3^": "delete",
  "[5^": "pageup",
  "[6^": "pagedown",
  "[7^": "home",
  "[8^": "end"
};
var SpecialKeyMap = {
  "\r": "return",
  "\n": "enter",
  "	": "tab",
  "\b": "backspace",
  "\x7F": "backspace",
  "\x1B": "escape",
  " ": "space"
};

// deno:https://jsr.io/@cliffy/keycode/1.0.0-rc.8/key_code.ts
var kUTF16SurrogateThreshold = 65536;
var kEscape = "\x1B";
function parse(data2) {
  let index = -1;
  const keys = [];
  const input = data2 instanceof Uint8Array ? new TextDecoder().decode(data2) : data2;
  const hasNext = () => input.length - 1 >= index + 1;
  const next = () => input[++index];
  parseNext();
  return keys;
  function parseNext() {
    let ch = next();
    let s = ch;
    let escaped = false;
    const key = {
      name: void 0,
      char: void 0,
      sequence: void 0,
      code: void 0,
      ctrl: false,
      meta: false,
      shift: false
    };
    if (ch === kEscape && hasNext()) {
      escaped = true;
      s += ch = next();
      if (ch === kEscape) {
        s += ch = next();
      }
    }
    if (escaped && (ch === "O" || ch === "[")) {
      let code2 = ch;
      let modifier = 0;
      if (ch === "O") {
        s += ch = next();
        if (ch >= "0" && ch <= "9") {
          modifier = (Number(ch) >> 0) - 1;
          s += ch = next();
        }
        code2 += ch;
      } else if (ch === "[") {
        s += ch = next();
        if (ch === "[") {
          code2 += ch;
          s += ch = next();
        }
        const cmdStart = s.length - 1;
        if (ch >= "0" && ch <= "9") {
          s += ch = next();
          if (ch >= "0" && ch <= "9") {
            s += ch = next();
          }
        }
        if (ch === ";") {
          s += ch = next();
          if (ch >= "0" && ch <= "9") {
            s += next();
          }
        }
        const cmd = s.slice(cmdStart);
        let match;
        if (match = cmd.match(/^(\d\d?)(;(\d))?([~^$])$/)) {
          code2 += match[1] + match[4];
          modifier = (Number(match[3]) || 1) - 1;
        } else if (match = cmd.match(/^((\d;)?(\d))?([A-Za-z])$/)) {
          code2 += match[4];
          modifier = (Number(match[3]) || 1) - 1;
        } else {
          code2 += cmd;
        }
      }
      key.ctrl = !!(modifier & 4);
      key.meta = !!(modifier & 10);
      key.shift = !!(modifier & 1);
      key.code = code2;
      if (code2 in KeyMap) {
        key.name = KeyMap[code2];
      } else if (code2 in KeyMapShift) {
        key.name = KeyMapShift[code2];
        key.shift = true;
      } else if (code2 in KeyMapCtrl) {
        key.name = KeyMapCtrl[code2];
        key.ctrl = true;
      } else {
        key.name = "undefined";
      }
    } else if (ch in SpecialKeyMap) {
      key.name = SpecialKeyMap[ch];
      key.meta = escaped;
      if (key.name === "space") {
        key.char = ch;
      }
    } else if (!escaped && ch <= "") {
      key.name = String.fromCharCode(ch.charCodeAt(0) + "a".charCodeAt(0) - 1);
      key.ctrl = true;
      key.char = key.name;
    } else if (/^[0-9A-Za-z]$/.test(ch)) {
      key.name = ch.toLowerCase();
      key.shift = /^[A-Z]$/.test(ch);
      key.meta = escaped;
      key.char = ch;
    } else if (escaped) {
      key.name = ch.length ? void 0 : "escape";
      key.meta = true;
    } else {
      key.name = ch;
      key.char = ch;
    }
    key.sequence = s;
    if (s.length !== 0 && (key.name !== void 0 || escaped) || charLengthAt(s, 0) === s.length) {
      keys.push(key);
    } else {
      throw new Error("Unrecognized or broken escape sequence");
    }
    if (hasNext()) {
      parseNext();
    }
  }
}
function charLengthAt(str2, i) {
  const pos = str2.codePointAt(i);
  if (typeof pos === "undefined") {
    return 1;
  }
  return pos >= kUTF16SurrogateThreshold ? 2 : 1;
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/get_columns.ts
function getColumns() {
  try {
    const { Deno: Deno4, process: process2 } = globalThis;
    if (Deno4) {
      return Deno4.consoleSize().columns ?? null;
    } else if (process2) {
      return process2.stdout.columns ?? null;
    }
  } catch (_error) {
    return null;
  }
  throw new Error("unsupported runtime");
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/is_terminal.ts
function isTerminal() {
  const { Deno: Deno4, process: process2 } = globalThis;
  if (Deno4) {
    return Deno4.stdin.isTerminal();
  } else if (process2) {
    return process2.stdin.isTTY;
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/read.ts
async function read(data2) {
  const { Deno: Deno4, Bun, process: process2 } = globalThis;
  if (Deno4) {
    return await Deno4.stdin.read(data2);
  } else if (Bun) {
    const reader = Bun.stdin.stream().getReader();
    const { value: buffer } = await reader.read();
    await reader.cancel();
    for (let i = 0; i < buffer.length; i++) {
      data2[i] = buffer[i];
    }
    return buffer.length;
  } else if (process2) {
    return await new Promise((resolve5, reject) => {
      process2.stdin.once("readable", () => {
        try {
          const buffer = process2.stdin.read();
          if (buffer === null) {
            return resolve5(null);
          }
          for (let i = 0; i < buffer.length; i++) {
            data2[i] = buffer[i];
          }
          resolve5(buffer.length);
        } catch (error) {
          reject(error);
        }
      });
    });
  } else {
    throw new Error("unsupported runtime");
  }
}

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/_generic_prompt.ts
var GenericPrompt = class _GenericPrompt {
  static injectedValue;
  cursor = {
    x: 0,
    y: 0
  };
  #value;
  #lastError;
  #isFirstRun = true;
  #encoder = new TextEncoder();
  /**
   * Inject prompt value. If called, the prompt doesn't prompt for an input and
   * returns immediately the injected value. Can be used for unit tests or pre
   * selections.
   *
   * @param value Input value.
   */
  static inject(value) {
    _GenericPrompt.injectedValue = value;
  }
  getDefaultSettings(options) {
    return {
      ...options,
      tty: tty({
        // Stdin is only used by getCursorPosition which we don't need.
        reader: {
          readSync,
          setRaw
        },
        writer: options.writer ?? {
          writeSync
        }
      }),
      cbreak: options.cbreak ?? false,
      reader: options.reader ?? {
        read,
        setRaw,
        isTerminal
      },
      writer: options.writer ?? {
        writeSync
      },
      pointer: options.pointer ?? brightBlue(Figures.POINTER_SMALL),
      prefix: options.prefix ?? yellow("? "),
      indent: options.indent ?? "",
      keys: {
        submit: [
          "enter",
          "return"
        ],
        ...options.keys ?? {}
      }
    };
  }
  /** Execute the prompt. */
  async prompt() {
    try {
      return await this.#execute();
    } finally {
      this.settings.tty.cursorShow();
    }
  }
  /** Clear prompt output. */
  clear() {
    this.settings.tty.cursorLeft.eraseDown();
  }
  /** Execute the prompt. */
  #execute = async () => {
    if (typeof _GenericPrompt.injectedValue !== "undefined" && this.#lastError) {
      throw new Error(this.error());
    }
    await this.render();
    this.#lastError = void 0;
    if (!await this.read()) {
      return this.#execute();
    }
    if (typeof this.#value === "undefined") {
      throw new Error("internal error: failed to read value");
    }
    this.clear();
    const successMessage = this.success(this.#value);
    if (successMessage) {
      this.settings.writer.writeSync(this.#encoder.encode(successMessage + "\n"));
    }
    _GenericPrompt.injectedValue = void 0;
    this.settings.tty.cursorShow();
    return this.#value;
  };
  /** Render prompt. */
  async render() {
    const result = await Promise.all([
      this.message(),
      this.body?.(),
      this.footer()
    ]);
    const content = result.filter(Boolean).join("\n");
    const lines = content.split("\n");
    const columns = getColumns();
    const linesCount = columns ? lines.reduce((prev, next) => {
      const length = stripAnsiCode(next).length;
      return prev + (length > columns ? Math.ceil(length / columns) : 1);
    }, 0) : content.split("\n").length;
    const y = linesCount - this.cursor.y - 1;
    if (!this.#isFirstRun || this.#lastError) {
      this.clear();
    }
    this.#isFirstRun = false;
    this.settings.writer.writeSync(this.#encoder.encode(content));
    if (y) {
      this.settings.tty.cursorUp(y);
    }
    this.settings.tty.cursorTo(this.cursor.x);
  }
  /** Read user input from stdin, handle events and validate user input. */
  async read() {
    if (typeof _GenericPrompt.injectedValue !== "undefined") {
      const value = _GenericPrompt.injectedValue;
      await this.#validateValue(value);
    } else {
      const events = await this.#readKey();
      if (!events.length) {
        return false;
      }
      for (const event of events) {
        await this.handleEvent(event);
      }
    }
    return typeof this.#value !== "undefined";
  }
  submit() {
    return this.#validateValue(this.getValue());
  }
  message() {
    return `${this.settings.indent}${this.settings.prefix}` + bold(this.settings.message) + this.defaults();
  }
  defaults() {
    let defaultMessage = "";
    if (typeof this.settings.default !== "undefined" && !this.settings.hideDefault) {
      defaultMessage += dim(` (${this.format(this.settings.default)})`);
    }
    return defaultMessage;
  }
  /** Get prompt success message. */
  success(value) {
    return `${this.settings.indent}${this.settings.prefix}` + bold(this.settings.message) + this.defaults() + " " + this.settings.pointer + " " + green(this.format(value));
  }
  footer() {
    return this.error() ?? this.hint();
  }
  error() {
    return this.#lastError ? this.settings.indent + red(bold(`${Figures.CROSS} `) + this.#lastError) : void 0;
  }
  hint() {
    return this.settings.hint ? this.settings.indent + italic(brightBlue(dim(`${Figures.POINTER} `) + this.settings.hint)) : void 0;
  }
  setErrorMessage(message) {
    this.#lastError = message;
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case (event.name === "c" && event.ctrl):
        this.clear();
        this.settings.tty.cursorShow();
        exit(130);
        return;
      case this.isKey(this.settings.keys, "submit", event):
        await this.submit();
        break;
    }
  }
  /** Read user input from stdin and pars ansi codes. */
  #readKey = async () => {
    const data2 = await this.#readChar();
    return data2.length ? parse(data2) : [];
  };
  /** Read user input from stdin. */
  #readChar = async () => {
    const buffer = new Uint8Array(getRuntimeName() === "deno" ? 8 : 4096);
    const isTty = this.settings.reader.isTerminal();
    if (isTty) {
      this.settings.reader.setRaw(true, {
        cbreak: this.settings.cbreak
      });
    }
    const nread = await this.settings.reader.read(buffer);
    if (isTty) {
      this.settings.reader.setRaw(false);
    }
    if (nread === null) {
      return buffer;
    }
    return buffer.subarray(0, nread);
  };
  /**
   * Map input value to output value. If a custom transform handler ist set, the
   * custom handler will be executed, otherwise the default transform handler
   * from the prompt will be executed.
   * @param value The value to transform.
   */
  #transformValue = (value) => {
    return this.settings.transform ? this.settings.transform(value) : this.transform(value);
  };
  /**
   * Validate input value. Set error message if validation fails and transform
   * output value on success.
   * If a default value is set, the default will be used as value without any
   * validation.
   * If a custom validation handler ist set, the custom handler will
   * be executed, otherwise a prompt specific default validation handler will be
   * executed.
   * @param value The value to validate.
   */
  #validateValue = async (value) => {
    if (!value && typeof this.settings.default !== "undefined") {
      this.#value = this.settings.default;
      return;
    }
    this.#value = void 0;
    this.#lastError = void 0;
    const validation = await (this.settings.validate ? this.settings.validate(value) : this.validate(value));
    if (validation === false) {
      this.#lastError = `Invalid answer.`;
    } else if (typeof validation === "string") {
      this.#lastError = validation;
    } else {
      this.#value = this.#transformValue(value);
    }
  };
  /**
   * Check if key event has given name or sequence.
   * @param keys  Key map.
   * @param name  Key name.
   * @param event Key event.
   */
  isKey(keys, name, event) {
    const keyNames = keys?.[name];
    return typeof keyNames !== "undefined" && (typeof event.name !== "undefined" && keyNames.indexOf(event.name) !== -1 || typeof event.sequence !== "undefined" && keyNames.indexOf(event.sequence) !== -1);
  }
};

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/_generic_input.ts
var GenericInput = class extends GenericPrompt {
  inputValue = "";
  inputIndex = 0;
  getDefaultSettings(options) {
    const settings = super.getDefaultSettings(options);
    return {
      ...settings,
      keys: {
        moveCursorLeft: [
          "left"
        ],
        moveCursorRight: [
          "right"
        ],
        deleteCharLeft: [
          "backspace"
        ],
        deleteCharRight: [
          "delete"
        ],
        ...settings.keys ?? {}
      }
    };
  }
  getCurrentInputValue() {
    return this.inputValue;
  }
  message() {
    const message = super.message() + " " + this.settings.pointer + " ";
    this.cursor.x = stripAnsiCode(message).length + this.inputIndex + 1;
    return message + this.input();
  }
  input() {
    return underline(this.inputValue);
  }
  highlight(value, color1 = dim, color2 = brightBlue) {
    value = value.toString();
    const inputLowerCase = this.getCurrentInputValue().toLowerCase();
    const valueLowerCase = value.toLowerCase();
    const index = valueLowerCase.indexOf(inputLowerCase);
    const matched = value.slice(index, index + inputLowerCase.length);
    return index >= 0 ? color1(value.slice(0, index)) + color2(matched) + color1(value.slice(index + inputLowerCase.length)) : value;
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case this.isKey(this.settings.keys, "moveCursorLeft", event):
        this.moveCursorLeft();
        break;
      case this.isKey(this.settings.keys, "moveCursorRight", event):
        this.moveCursorRight();
        break;
      case this.isKey(this.settings.keys, "deleteCharRight", event):
        this.deleteCharRight();
        break;
      case this.isKey(this.settings.keys, "deleteCharLeft", event):
        this.deleteChar();
        break;
      case (event.char && !event.meta && !event.ctrl):
        this.addChar(event.char);
        break;
      default:
        await super.handleEvent(event);
    }
  }
  /** Add character to current input. */
  addChar(char) {
    this.inputValue = this.inputValue.slice(0, this.inputIndex) + char + this.inputValue.slice(this.inputIndex);
    this.inputIndex++;
  }
  /** Move prompt cursor left. */
  moveCursorLeft() {
    if (this.inputIndex > 0) {
      this.inputIndex--;
    }
  }
  /** Move prompt cursor right. */
  moveCursorRight() {
    if (this.inputIndex < this.inputValue.length) {
      this.inputIndex++;
    }
  }
  /** Delete char left. */
  deleteChar() {
    if (this.inputIndex > 0) {
      this.inputIndex--;
      this.deleteCharRight();
    }
  }
  /** Delete char right. */
  deleteCharRight() {
    if (this.inputIndex < this.inputValue.length) {
      this.inputValue = this.inputValue.slice(0, this.inputIndex) + this.inputValue.slice(this.inputIndex + 1);
    }
  }
};

// deno:https://jsr.io/@std/path/1.0.9/_os.ts
var isWindows = globalThis.Deno?.build.os === "windows" || globalThis.navigator?.platform?.startsWith("Win") || globalThis.process?.platform?.startsWith("win") || false;

// deno:https://jsr.io/@std/path/1.0.9/_common/assert_path.ts
function assertPath(path) {
  if (typeof path !== "string") {
    throw new TypeError(`Path must be a string, received "${JSON.stringify(path)}"`);
  }
}

// deno:https://jsr.io/@std/path/1.0.9/_common/strip_trailing_separators.ts
function stripTrailingSeparators(segment, isSep) {
  if (segment.length <= 1) {
    return segment;
  }
  let end = segment.length;
  for (let i = segment.length - 1; i > 0; i--) {
    if (isSep(segment.charCodeAt(i))) {
      end = i;
    } else {
      break;
    }
  }
  return segment.slice(0, end);
}

// deno:https://jsr.io/@std/path/1.0.9/_common/constants.ts
var CHAR_UPPERCASE_A = 65;
var CHAR_LOWERCASE_A = 97;
var CHAR_UPPERCASE_Z = 90;
var CHAR_LOWERCASE_Z = 122;
var CHAR_DOT = 46;
var CHAR_FORWARD_SLASH = 47;
var CHAR_BACKWARD_SLASH = 92;
var CHAR_COLON = 58;

// deno:https://jsr.io/@std/path/1.0.9/posix/_util.ts
function isPosixPathSeparator(code2) {
  return code2 === CHAR_FORWARD_SLASH;
}

// deno:https://jsr.io/@std/path/1.0.9/windows/_util.ts
function isPosixPathSeparator2(code2) {
  return code2 === CHAR_FORWARD_SLASH;
}
function isPathSeparator(code2) {
  return code2 === CHAR_FORWARD_SLASH || code2 === CHAR_BACKWARD_SLASH;
}
function isWindowsDeviceRoot(code2) {
  return code2 >= CHAR_LOWERCASE_A && code2 <= CHAR_LOWERCASE_Z || code2 >= CHAR_UPPERCASE_A && code2 <= CHAR_UPPERCASE_Z;
}

// deno:https://jsr.io/@std/path/1.0.9/_common/dirname.ts
function assertArg(path) {
  assertPath(path);
  if (path.length === 0) return ".";
}

// deno:https://jsr.io/@std/path/1.0.9/posix/dirname.ts
function dirname(path) {
  assertArg(path);
  let end = -1;
  let matchedNonSeparator = false;
  for (let i = path.length - 1; i >= 1; --i) {
    if (isPosixPathSeparator(path.charCodeAt(i))) {
      if (matchedNonSeparator) {
        end = i;
        break;
      }
    } else {
      matchedNonSeparator = true;
    }
  }
  if (end === -1) {
    return isPosixPathSeparator(path.charCodeAt(0)) ? "/" : ".";
  }
  return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator);
}

// deno:https://jsr.io/@std/path/1.0.9/windows/dirname.ts
function dirname2(path) {
  assertArg(path);
  const len = path.length;
  let rootEnd = -1;
  let end = -1;
  let matchedSlash = true;
  let offset = 0;
  const code2 = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator(code2)) {
      rootEnd = offset = 1;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) {
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          last = j;
          for (; j < len; ++j) {
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) {
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              return path;
            }
            if (j !== last) {
              rootEnd = offset = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot(code2)) {
      if (path.charCodeAt(1) === CHAR_COLON) {
        rootEnd = offset = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) rootEnd = offset = 3;
        }
      }
    }
  } else if (isPathSeparator(code2)) {
    return path;
  }
  for (let i = len - 1; i >= offset; --i) {
    if (isPathSeparator(path.charCodeAt(i))) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) {
    if (rootEnd === -1) return ".";
    else end = rootEnd;
  }
  return stripTrailingSeparators(path.slice(0, end), isPosixPathSeparator2);
}

// deno:https://jsr.io/@std/path/1.0.9/dirname.ts
function dirname3(path) {
  return isWindows ? dirname2(path) : dirname(path);
}

// deno:https://jsr.io/@std/path/1.0.9/_common/normalize.ts
function assertArg4(path) {
  assertPath(path);
  if (path.length === 0) return ".";
}

// deno:https://jsr.io/@std/path/1.0.9/_common/normalize_string.ts
function normalizeString(path, allowAboveRoot, separator, isPathSeparator3) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code2;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code2 = path.charCodeAt(i);
    else if (isPathSeparator3(code2)) break;
    else code2 = CHAR_FORWARD_SLASH;
    if (isPathSeparator3(code2)) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== CHAR_DOT || res.charCodeAt(res.length - 2) !== CHAR_DOT) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += `${separator}..`;
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code2 === CHAR_DOT && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

// deno:https://jsr.io/@std/path/1.0.9/posix/normalize.ts
function normalize(path) {
  assertArg4(path);
  const isAbsolute5 = isPosixPathSeparator(path.charCodeAt(0));
  const trailingSeparator = isPosixPathSeparator(path.charCodeAt(path.length - 1));
  path = normalizeString(path, !isAbsolute5, "/", isPosixPathSeparator);
  if (path.length === 0 && !isAbsolute5) path = ".";
  if (path.length > 0 && trailingSeparator) path += "/";
  if (isAbsolute5) return `/${path}`;
  return path;
}

// deno:https://jsr.io/@std/path/1.0.9/posix/join.ts
function join(...paths) {
  if (paths.length === 0) return ".";
  paths.forEach((path) => assertPath(path));
  const joined = paths.filter((path) => path.length > 0).join("/");
  return joined === "" ? "." : normalize(joined);
}

// deno:https://jsr.io/@std/path/1.0.9/windows/normalize.ts
function normalize2(path) {
  assertArg4(path);
  const len = path.length;
  let rootEnd = 0;
  let device;
  let isAbsolute5 = false;
  const code2 = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator(code2)) {
      isAbsolute5 = true;
      if (isPathSeparator(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) {
          if (isPathSeparator(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          for (; j < len; ++j) {
            if (!isPathSeparator(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) {
              if (isPathSeparator(path.charCodeAt(j))) break;
            }
            if (j === len) {
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            } else if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot(code2)) {
      if (path.charCodeAt(1) === CHAR_COLON) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator(path.charCodeAt(2))) {
            isAbsolute5 = true;
            rootEnd = 3;
          }
        }
      }
    }
  } else if (isPathSeparator(code2)) {
    return "\\";
  }
  let tail;
  if (rootEnd < len) {
    tail = normalizeString(path.slice(rootEnd), !isAbsolute5, "\\", isPathSeparator);
  } else {
    tail = "";
  }
  if (tail.length === 0 && !isAbsolute5) tail = ".";
  if (tail.length > 0 && isPathSeparator(path.charCodeAt(len - 1))) {
    tail += "\\";
  }
  if (device === void 0) {
    if (isAbsolute5) {
      if (tail.length > 0) return `\\${tail}`;
      else return "\\";
    }
    return tail;
  } else if (isAbsolute5) {
    if (tail.length > 0) return `${device}\\${tail}`;
    else return `${device}\\`;
  }
  return device + tail;
}

// deno:https://jsr.io/@std/path/1.0.9/windows/join.ts
function join2(...paths) {
  paths.forEach((path) => assertPath(path));
  paths = paths.filter((path) => path.length > 0);
  if (paths.length === 0) return ".";
  let needsReplace = true;
  let slashCount = 0;
  const firstPart = paths[0];
  if (isPathSeparator(firstPart.charCodeAt(0))) {
    ++slashCount;
    const firstLen = firstPart.length;
    if (firstLen > 1) {
      if (isPathSeparator(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator(firstPart.charCodeAt(2))) ++slashCount;
          else {
            needsReplace = false;
          }
        }
      }
    }
  }
  let joined = paths.join("\\");
  if (needsReplace) {
    for (; slashCount < joined.length; ++slashCount) {
      if (!isPathSeparator(joined.charCodeAt(slashCount))) break;
    }
    if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
  }
  return normalize2(joined);
}

// deno:https://jsr.io/@std/path/1.0.9/join.ts
function join3(...paths) {
  return isWindows ? join2(...paths) : join(...paths);
}

// deno:https://jsr.io/@std/path/1.0.9/normalize.ts
function normalize3(path) {
  return isWindows ? normalize2(path) : normalize(path);
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/stat.ts
async function stat(input) {
  const { Deno: Deno4 } = globalThis;
  if (Deno4) {
    return Deno4.stat(input);
  }
  const { statSync } = await import("node:fs");
  const stats = statSync(input);
  return {
    get isDirectory() {
      return stats.isDirectory();
    }
  };
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/is_directory.ts
async function isDirectory(path) {
  try {
    const { isDirectory: isDirectory2 } = await stat(path);
    return isDirectory2;
  } catch {
    return false;
  }
}

// deno:https://jsr.io/@cliffy/internal/1.0.0-rc.8/runtime/read_dir.ts
async function readDir(path) {
  const { Deno: Deno4 } = globalThis;
  path ||= ".";
  if (Deno4) {
    const array = [];
    for await (const item of Deno4.readDir(path)) {
      array.push(item);
    }
    return array;
  }
  const fs = await import("node:fs");
  return new Promise((resolve5, reject) => {
    fs.readdir(path, (err, files) => err ? reject(err) : resolve5(files.map((name) => ({
      name
    }))));
  });
}

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/_generic_suggestions.ts
var sep = getOs() === "windows" ? "\\" : "/";
var GenericSuggestions = class extends GenericInput {
  suggestionsIndex = -1;
  suggestionsOffset = 0;
  suggestions = [];
  #envPermissions = {};
  #hasReadPermissions;
  getDefaultSettings(options) {
    const settings = super.getDefaultSettings(options);
    return {
      ...settings,
      listPointer: options.listPointer ?? brightBlue(Figures.POINTER),
      maxRows: options.maxRows ?? 8,
      keys: {
        complete: [
          "tab"
        ],
        next: [
          "up"
        ],
        previous: [
          "down"
        ],
        nextPage: [
          "pageup"
        ],
        previousPage: [
          "pagedown"
        ],
        ...settings.keys ?? {}
      }
    };
  }
  get localStorage() {
    if (this.settings.id && "localStorage" in window) {
      try {
        return window.localStorage;
      } catch (_) {
      }
    }
    return null;
  }
  loadSuggestions() {
    if (this.settings.id) {
      const json = this.localStorage?.getItem(this.settings.id);
      const suggestions = json ? JSON.parse(json) : [];
      if (!Array.isArray(suggestions)) {
        return [];
      }
      return suggestions;
    }
    return [];
  }
  saveSuggestions(...suggestions) {
    if (this.settings.id) {
      this.localStorage?.setItem(this.settings.id, JSON.stringify([
        ...suggestions,
        ...this.loadSuggestions()
      ].filter(uniqueSuggestions)));
    }
  }
  async render() {
    if (this.settings.files && this.#hasReadPermissions === void 0) {
      const status = await globalThis.Deno?.permissions.request({
        name: "read"
      });
      this.#hasReadPermissions = !status || status.state === "granted";
    }
    if (this.#isFileModeEnabled()) {
      await this.#expandInputValue(this.inputValue);
    }
    await this.match();
    return super.render();
  }
  async match() {
    this.suggestions = await this.getSuggestions();
    this.suggestionsIndex = Math.max(this.getCurrentInputValue().trim().length === 0 ? -1 : 0, Math.min(this.suggestions.length - 1, this.suggestionsIndex));
    this.suggestionsOffset = Math.max(0, Math.min(this.suggestions.length - this.getListHeight(), this.suggestionsOffset));
  }
  input() {
    return super.input() + dim(this.getSuggestion());
  }
  getSuggestion() {
    return this.suggestions[this.suggestionsIndex]?.toString().substr(this.getCurrentInputValue().length) ?? "";
  }
  async getUserSuggestions(input) {
    return typeof this.settings.suggestions === "function" ? await this.settings.suggestions(input) : this.settings.suggestions ?? [];
  }
  #isFileModeEnabled() {
    return !!this.settings.files && this.#hasReadPermissions === true;
  }
  async getFileSuggestions(input) {
    if (!this.#isFileModeEnabled()) {
      return [];
    }
    const path = await stat(input).then((file) => file.isDirectory ? input : dirname3(input)).catch(() => dirname3(input));
    try {
      return await listDir(path, this.settings.files);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.PermissionDenied) {
        this.setErrorMessage(error.message);
        return [];
      }
      throw error;
    }
  }
  async getSuggestions() {
    const input = this.getCurrentInputValue();
    const suggestions = [
      ...this.loadSuggestions(),
      ...await this.getUserSuggestions(input),
      ...await this.getFileSuggestions(input)
    ].filter(uniqueSuggestions);
    if (!input.length) {
      return suggestions;
    }
    return suggestions.filter((value) => stripAnsiCode(value.toString()).toLowerCase().startsWith(input.toLowerCase())).sort((a, b) => levenshteinDistance((a || a).toString(), input) - levenshteinDistance((b || b).toString(), input));
  }
  body() {
    return this.getList() + this.getInfo();
  }
  getInfo() {
    if (!this.settings.info) {
      return "";
    }
    const selected = this.suggestionsIndex + 1;
    const matched = this.suggestions.length;
    const actions = [];
    if (this.suggestions.length) {
      if (this.settings.list) {
        actions.push([
          "Next",
          getFiguresByKeys(this.settings.keys?.next ?? [])
        ], [
          "Previous",
          getFiguresByKeys(this.settings.keys?.previous ?? [])
        ], [
          "Next Page",
          getFiguresByKeys(this.settings.keys?.nextPage ?? [])
        ], [
          "Previous Page",
          getFiguresByKeys(this.settings.keys?.previousPage ?? [])
        ]);
      } else {
        actions.push([
          "Next",
          getFiguresByKeys(this.settings.keys?.next ?? [])
        ], [
          "Previous",
          getFiguresByKeys(this.settings.keys?.previous ?? [])
        ]);
      }
      actions.push([
        "Complete",
        getFiguresByKeys(this.settings.keys?.complete ?? [])
      ]);
    }
    actions.push([
      "Submit",
      getFiguresByKeys(this.settings.keys?.submit ?? [])
    ]);
    let info = this.settings.indent;
    if (this.suggestions.length) {
      info += brightBlue(Figures.INFO) + bold(` ${selected}/${matched} `);
    }
    info += actions.map((cur) => `${cur[0]}: ${bold(cur[1].join(" "))}`).join(", ");
    return info;
  }
  getList() {
    if (!this.suggestions.length || !this.settings.list) {
      return "";
    }
    const list = [];
    const height = this.getListHeight();
    for (let i = this.suggestionsOffset; i < this.suggestionsOffset + height; i++) {
      list.push(this.getListItem(this.suggestions[i], this.suggestionsIndex === i));
    }
    if (list.length && this.settings.info) {
      list.push("");
    }
    return list.join("\n");
  }
  /**
   * Render option.
   * @param value        Option.
   * @param isSelected  Set to true if option is selected.
   */
  getListItem(value, isSelected) {
    let line = this.settings.indent ?? "";
    line += isSelected ? `${this.settings.listPointer} ` : "  ";
    if (isSelected) {
      line += underline(this.highlight(value));
    } else {
      line += this.highlight(value);
    }
    return line;
  }
  /** Get suggestions row height. */
  getListHeight(suggestions = this.suggestions) {
    return Math.min(suggestions.length, this.settings.maxRows || suggestions.length);
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case this.isKey(this.settings.keys, "next", event):
        if (this.settings.list) {
          this.selectPreviousSuggestion();
        } else {
          this.selectNextSuggestion();
        }
        break;
      case this.isKey(this.settings.keys, "previous", event):
        if (this.settings.list) {
          this.selectNextSuggestion();
        } else {
          this.selectPreviousSuggestion();
        }
        break;
      case this.isKey(this.settings.keys, "nextPage", event):
        if (this.settings.list) {
          this.selectPreviousSuggestionsPage();
        } else {
          this.selectNextSuggestionsPage();
        }
        break;
      case this.isKey(this.settings.keys, "previousPage", event):
        if (this.settings.list) {
          this.selectNextSuggestionsPage();
        } else {
          this.selectPreviousSuggestionsPage();
        }
        break;
      case this.isKey(this.settings.keys, "complete", event):
        await this.#completeValue();
        break;
      case this.isKey(this.settings.keys, "moveCursorRight", event):
        if (this.inputIndex < this.inputValue.length) {
          this.moveCursorRight();
        } else {
          await this.#completeValue();
        }
        break;
      default:
        await super.handleEvent(event);
    }
  }
  /** Delete char right. */
  deleteCharRight() {
    if (this.inputIndex < this.inputValue.length) {
      super.deleteCharRight();
      if (!this.getCurrentInputValue().length) {
        this.suggestionsIndex = -1;
        this.suggestionsOffset = 0;
      }
    }
  }
  async #completeValue() {
    const inputValue = await this.complete();
    this.setInputValue(inputValue);
  }
  setInputValue(inputValue) {
    this.inputValue = inputValue;
    this.inputIndex = this.inputValue.length;
    this.suggestionsIndex = 0;
    this.suggestionsOffset = 0;
  }
  async complete() {
    let input = this.getCurrentInputValue();
    const suggestion = this.suggestions[this.suggestionsIndex]?.toString();
    if (this.settings.complete) {
      input = await this.settings.complete(input, suggestion);
    } else if (this.#isFileModeEnabled() && input.at(-1) !== sep && await isDirectory(input) && (this.getCurrentInputValue().at(-1) !== "." || this.getCurrentInputValue().endsWith(".."))) {
      input += sep;
    } else if (suggestion) {
      input = suggestion;
    }
    return this.#isFileModeEnabled() ? normalize3(input) : input;
  }
  /** Select previous suggestion. */
  selectPreviousSuggestion() {
    if (this.suggestions.length) {
      if (this.suggestionsIndex > -1) {
        this.suggestionsIndex--;
        if (this.suggestionsIndex < this.suggestionsOffset) {
          this.suggestionsOffset--;
        }
      }
    }
  }
  /** Select next suggestion. */
  selectNextSuggestion() {
    if (this.suggestions.length) {
      if (this.suggestionsIndex < this.suggestions.length - 1) {
        this.suggestionsIndex++;
        if (this.suggestionsIndex >= this.suggestionsOffset + this.getListHeight()) {
          this.suggestionsOffset++;
        }
      }
    }
  }
  /** Select previous suggestions page. */
  selectPreviousSuggestionsPage() {
    if (this.suggestions.length) {
      const height = this.getListHeight();
      if (this.suggestionsOffset >= height) {
        this.suggestionsIndex -= height;
        this.suggestionsOffset -= height;
      } else if (this.suggestionsOffset > 0) {
        this.suggestionsIndex -= this.suggestionsOffset;
        this.suggestionsOffset = 0;
      }
    }
  }
  /** Select next suggestions page. */
  selectNextSuggestionsPage() {
    if (this.suggestions.length) {
      const height = this.getListHeight();
      if (this.suggestionsOffset + height + height < this.suggestions.length) {
        this.suggestionsIndex += height;
        this.suggestionsOffset += height;
      } else if (this.suggestionsOffset + height < this.suggestions.length) {
        const offset = this.suggestions.length - height;
        this.suggestionsIndex += offset - this.suggestionsOffset;
        this.suggestionsOffset = offset;
      }
    }
  }
  async #expandInputValue(path) {
    if (!path.startsWith("~")) {
      return;
    }
    const envVar = getHomeDirEnvVar();
    const hasEnvPermissions = await this.#hasEnvPermissions(envVar);
    if (!hasEnvPermissions) {
      return;
    }
    const homeDir = getHomeDir();
    if (homeDir) {
      path = path.replace("~", homeDir);
      this.setInputValue(path);
    }
  }
  async #hasEnvPermissions(variable) {
    if (this.#envPermissions[variable]) {
      return this.#envPermissions[variable];
    }
    const desc = {
      name: "env",
      variable
    };
    const currentStatus = await Deno.permissions.query(desc);
    this.#envPermissions[variable] = currentStatus.state === "granted";
    if (!this.#envPermissions[variable]) {
      this.clear();
      const newStatus = await Deno.permissions.request(desc);
      this.#envPermissions[variable] = newStatus.state === "granted";
    }
    return this.#envPermissions[variable];
  }
};
function uniqueSuggestions(value, index, self) {
  return typeof value !== "undefined" && value !== "" && self.indexOf(value) === index;
}
async function listDir(path, mode) {
  const fileNames = [];
  for (const file of await readDir(path)) {
    if (mode === true && (file.name.startsWith(".") || file.name.endsWith("~"))) {
      continue;
    }
    const filePath = join3(path, file.name);
    if (mode instanceof RegExp && !mode.test(filePath)) {
      continue;
    }
    fileNames.push(filePath);
  }
  return fileNames.sort(function(a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}
function getHomeDirEnvVar() {
  return Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
}
function getHomeDir() {
  return Deno.env.get(getHomeDirEnvVar());
}

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/confirm.ts
var Confirm = class extends GenericSuggestions {
  settings;
  /** Execute the prompt with provided options. */
  static prompt(options) {
    return new this(options).prompt();
  }
  /**
   * Inject prompt value. If called, the prompt doesn't prompt for an input and
   * returns immediately the injected value. Can be used for unit tests or pre
   * selections.
   *
   * @param value Input value.
   */
  static inject(value) {
    GenericPrompt.inject(value);
  }
  constructor(options) {
    super();
    if (typeof options === "string") {
      options = {
        message: options
      };
    }
    this.settings = this.getDefaultSettings(options);
  }
  getDefaultSettings(options) {
    return {
      ...super.getDefaultSettings(options),
      active: options.active || "Yes",
      inactive: options.inactive || "No",
      files: false,
      complete: void 0,
      suggestions: [
        options.active || "Yes",
        options.inactive || "No"
      ],
      list: false,
      info: false
    };
  }
  defaults() {
    let defaultMessage = "";
    if (this.settings.default === true) {
      defaultMessage += this.settings.active[0].toUpperCase() + "/" + this.settings.inactive[0].toLowerCase();
    } else if (this.settings.default === false) {
      defaultMessage += this.settings.active[0].toLowerCase() + "/" + this.settings.inactive[0].toUpperCase();
    } else {
      defaultMessage += this.settings.active[0].toLowerCase() + "/" + this.settings.inactive[0].toLowerCase();
    }
    return defaultMessage ? dim(` (${defaultMessage})`) : "";
  }
  success(value) {
    this.saveSuggestions(this.format(value));
    return super.success(value);
  }
  /** Get input input. */
  getValue() {
    return this.inputValue;
  }
  /**
   * Validate input value.
   * @param value User input value.
   * @return True on success, false or error message on error.
   */
  validate(value) {
    return typeof value === "string" && [
      this.settings.active[0].toLowerCase(),
      this.settings.active.toLowerCase(),
      this.settings.inactive[0].toLowerCase(),
      this.settings.inactive.toLowerCase()
    ].indexOf(value.toLowerCase()) !== -1;
  }
  /**
   * Map input value to output value.
   * @param value Input value.
   * @return Output value.
   */
  transform(value) {
    switch (value.toLowerCase()) {
      case this.settings.active[0].toLowerCase():
      case this.settings.active.toLowerCase():
        return true;
      case this.settings.inactive[0].toLowerCase():
      case this.settings.inactive.toLowerCase():
        return false;
    }
    return;
  }
  /**
   * Format output value.
   * @param value Output value.
   */
  format(value) {
    return value ? this.settings.active : this.settings.inactive;
  }
};

// deno:https://jsr.io/@cliffy/prompt/1.0.0-rc.8/input.ts
var Input = class extends GenericSuggestions {
  settings;
  /** Execute the prompt with provided options. */
  static prompt(options) {
    return new this(options).prompt();
  }
  /**
   * Inject prompt value. If called, the prompt doesn't prompt for an input and
   * returns immediately the injected value. Can be used for unit tests or pre
   * selections.
   *
   * @param value Input value.
   */
  static inject(value) {
    GenericPrompt.inject(value);
  }
  constructor(options) {
    super();
    if (typeof options === "string") {
      options = {
        message: options
      };
    }
    this.settings = this.getDefaultSettings(options);
  }
  getDefaultSettings(options) {
    return {
      ...super.getDefaultSettings(options),
      minLength: options.minLength ?? 0,
      maxLength: options.maxLength ?? Infinity
    };
  }
  success(value) {
    this.saveSuggestions(value);
    return super.success(value);
  }
  /** Get input value. */
  getValue() {
    return this.settings.files && this.inputValue ? normalize3(this.inputValue) : this.inputValue;
  }
  /**
   * Validate input value.
   * @param value User input value.
   * @return True on success, false or error message on error.
   */
  validate(value) {
    if (typeof value !== "string") {
      return false;
    }
    if (value.length < this.settings.minLength) {
      return `Value must be longer than ${this.settings.minLength} but has a length of ${value.length}.`;
    }
    if (value.length > this.settings.maxLength) {
      return `Value can't be longer than ${this.settings.maxLength} but has a length of ${value.length}.`;
    }
    return true;
  }
  /**
   * Map input value to output value.
   * @param value Input value.
   * @return Output value.
   */
  transform(value) {
    return value.trim();
  }
  /**
   * Format output value.
   * @param value Output value.
   */
  format(value) {
    return value;
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_chars.ts
var BOM = 65279;
var TAB = 9;
var LINE_FEED = 10;
var CARRIAGE_RETURN = 13;
var SPACE = 32;
var EXCLAMATION = 33;
var DOUBLE_QUOTE = 34;
var SHARP = 35;
var PERCENT = 37;
var AMPERSAND = 38;
var SINGLE_QUOTE = 39;
var ASTERISK = 42;
var PLUS = 43;
var COMMA = 44;
var MINUS = 45;
var DOT = 46;
var COLON = 58;
var SMALLER_THAN = 60;
var GREATER_THAN = 62;
var QUESTION = 63;
var COMMERCIAL_AT = 64;
var LEFT_SQUARE_BRACKET = 91;
var BACKSLASH = 92;
var RIGHT_SQUARE_BRACKET = 93;
var GRAVE_ACCENT = 96;
var LEFT_CURLY_BRACKET = 123;
var VERTICAL_LINE = 124;
var RIGHT_CURLY_BRACKET = 125;
function isEOL(c) {
  return c === LINE_FEED || c === CARRIAGE_RETURN;
}
function isWhiteSpace(c) {
  return c === TAB || c === SPACE;
}
function isWhiteSpaceOrEOL(c) {
  return isWhiteSpace(c) || isEOL(c);
}
function isFlowIndicator(c) {
  return c === COMMA || c === LEFT_SQUARE_BRACKET || c === RIGHT_SQUARE_BRACKET || c === LEFT_CURLY_BRACKET || c === RIGHT_CURLY_BRACKET;
}

// deno:https://jsr.io/@std/yaml/1.0.9/_type/binary.ts
var BASE64_MAP = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=\n\r";
function resolveYamlBinary(data2) {
  if (data2 === null) return false;
  let code2;
  let bitlen = 0;
  const max = data2.length;
  const map2 = BASE64_MAP;
  for (let idx = 0; idx < max; idx++) {
    code2 = map2.indexOf(data2.charAt(idx));
    if (code2 > 64) continue;
    if (code2 < 0) return false;
    bitlen += 6;
  }
  return bitlen % 8 === 0;
}
function constructYamlBinary(data2) {
  const input = data2.replace(/[\r\n=]/g, "");
  const max = input.length;
  const map2 = BASE64_MAP;
  const result = [];
  let bits = 0;
  for (let idx = 0; idx < max; idx++) {
    if (idx % 4 === 0 && idx) {
      result.push(bits >> 16 & 255);
      result.push(bits >> 8 & 255);
      result.push(bits & 255);
    }
    bits = bits << 6 | map2.indexOf(input.charAt(idx));
  }
  const tailbits = max % 4 * 6;
  if (tailbits === 0) {
    result.push(bits >> 16 & 255);
    result.push(bits >> 8 & 255);
    result.push(bits & 255);
  } else if (tailbits === 18) {
    result.push(bits >> 10 & 255);
    result.push(bits >> 2 & 255);
  } else if (tailbits === 12) {
    result.push(bits >> 4 & 255);
  }
  return new Uint8Array(result);
}
function representYamlBinary(object) {
  const max = object.length;
  const map2 = BASE64_MAP;
  let result = "";
  let bits = 0;
  for (let idx = 0; idx < max; idx++) {
    if (idx % 3 === 0 && idx) {
      result += map2[bits >> 18 & 63];
      result += map2[bits >> 12 & 63];
      result += map2[bits >> 6 & 63];
      result += map2[bits & 63];
    }
    bits = (bits << 8) + object[idx];
  }
  const tail = max % 3;
  if (tail === 0) {
    result += map2[bits >> 18 & 63];
    result += map2[bits >> 12 & 63];
    result += map2[bits >> 6 & 63];
    result += map2[bits & 63];
  } else if (tail === 2) {
    result += map2[bits >> 10 & 63];
    result += map2[bits >> 4 & 63];
    result += map2[bits << 2 & 63];
    result += map2[64];
  } else if (tail === 1) {
    result += map2[bits >> 2 & 63];
    result += map2[bits << 4 & 63];
    result += map2[64];
    result += map2[64];
  }
  return result;
}
function isBinary(obj) {
  return obj instanceof Uint8Array;
}
var binary = {
  tag: "tag:yaml.org,2002:binary",
  construct: constructYamlBinary,
  kind: "scalar",
  predicate: isBinary,
  represent: representYamlBinary,
  resolve: resolveYamlBinary
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/bool.ts
var YAML_TRUE_BOOLEANS = [
  "true",
  "True",
  "TRUE"
];
var YAML_FALSE_BOOLEANS = [
  "false",
  "False",
  "FALSE"
];
var YAML_BOOLEANS = [
  ...YAML_TRUE_BOOLEANS,
  ...YAML_FALSE_BOOLEANS
];
var bool = {
  tag: "tag:yaml.org,2002:bool",
  kind: "scalar",
  defaultStyle: "lowercase",
  predicate: (value) => typeof value === "boolean" || value instanceof Boolean,
  construct: (data2) => YAML_TRUE_BOOLEANS.includes(data2),
  resolve: (data2) => YAML_BOOLEANS.includes(data2),
  represent: {
    // deno-lint-ignore ban-types
    lowercase: (object) => {
      const value = object instanceof Boolean ? object.valueOf() : object;
      return value ? "true" : "false";
    },
    // deno-lint-ignore ban-types
    uppercase: (object) => {
      const value = object instanceof Boolean ? object.valueOf() : object;
      return value ? "TRUE" : "FALSE";
    },
    // deno-lint-ignore ban-types
    camelcase: (object) => {
      const value = object instanceof Boolean ? object.valueOf() : object;
      return value ? "True" : "False";
    }
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_utils.ts
function isObject(value) {
  return value !== null && typeof value === "object";
}
function isNegativeZero(i) {
  return i === 0 && Number.NEGATIVE_INFINITY === 1 / i;
}
function isPlainObject(object) {
  return Object.prototype.toString.call(object) === "[object Object]";
}

// deno:https://jsr.io/@std/yaml/1.0.9/_type/float.ts
var YAML_FLOAT_PATTERN = new RegExp("^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?|\\.[0-9_]+(?:[eE][-+]?[0-9]+)?|[-+]?\\.(?:inf|Inf|INF)|\\.(?:nan|NaN|NAN))$");
function resolveYamlFloat(data2) {
  if (!YAML_FLOAT_PATTERN.test(data2) || // Quick hack to not allow integers end with `_`
  // Probably should update regexp & check speed
  data2[data2.length - 1] === "_") {
    return false;
  }
  return true;
}
function constructYamlFloat(data2) {
  let value = data2.replace(/_/g, "").toLowerCase();
  const sign = value[0] === "-" ? -1 : 1;
  if (value[0] && "+-".includes(value[0])) {
    value = value.slice(1);
  }
  if (value === ".inf") {
    return sign === 1 ? Number.POSITIVE_INFINITY : Number.NEGATIVE_INFINITY;
  }
  if (value === ".nan") {
    return NaN;
  }
  return sign * parseFloat(value);
}
var SCIENTIFIC_WITHOUT_DOT = /^[-+]?[0-9]+e/;
function representYamlFloat(object, style) {
  const value = object instanceof Number ? object.valueOf() : object;
  if (isNaN(value)) {
    switch (style) {
      case "lowercase":
        return ".nan";
      case "uppercase":
        return ".NAN";
      case "camelcase":
        return ".NaN";
    }
  } else if (Number.POSITIVE_INFINITY === value) {
    switch (style) {
      case "lowercase":
        return ".inf";
      case "uppercase":
        return ".INF";
      case "camelcase":
        return ".Inf";
    }
  } else if (Number.NEGATIVE_INFINITY === value) {
    switch (style) {
      case "lowercase":
        return "-.inf";
      case "uppercase":
        return "-.INF";
      case "camelcase":
        return "-.Inf";
    }
  } else if (isNegativeZero(value)) {
    return "-0.0";
  }
  const res = value.toString(10);
  return SCIENTIFIC_WITHOUT_DOT.test(res) ? res.replace("e", ".e") : res;
}
function isFloat(object) {
  if (object instanceof Number) object = object.valueOf();
  return typeof object === "number" && (object % 1 !== 0 || isNegativeZero(object));
}
var float = {
  tag: "tag:yaml.org,2002:float",
  construct: constructYamlFloat,
  defaultStyle: "lowercase",
  kind: "scalar",
  predicate: isFloat,
  represent: representYamlFloat,
  resolve: resolveYamlFloat
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/int.ts
function isCharCodeInRange(c, lower, upper) {
  return lower <= c && c <= upper;
}
function isHexCode(c) {
  return isCharCodeInRange(c, 48, 57) || // 0-9
  isCharCodeInRange(c, 65, 70) || // A-F
  isCharCodeInRange(c, 97, 102);
}
function isOctCode(c) {
  return isCharCodeInRange(c, 48, 55);
}
function isDecCode(c) {
  return isCharCodeInRange(c, 48, 57);
}
function resolveYamlInteger(data2) {
  const max = data2.length;
  let index = 0;
  let hasDigits = false;
  if (!max) return false;
  let ch = data2[index];
  if (ch === "-" || ch === "+") {
    ch = data2[++index];
  }
  if (ch === "0") {
    if (index + 1 === max) return true;
    ch = data2[++index];
    if (ch === "b") {
      index++;
      for (; index < max; index++) {
        ch = data2[index];
        if (ch === "_") continue;
        if (ch !== "0" && ch !== "1") return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    if (ch === "x") {
      index++;
      for (; index < max; index++) {
        ch = data2[index];
        if (ch === "_") continue;
        if (!isHexCode(data2.charCodeAt(index))) return false;
        hasDigits = true;
      }
      return hasDigits && ch !== "_";
    }
    for (; index < max; index++) {
      ch = data2[index];
      if (ch === "_") continue;
      if (!isOctCode(data2.charCodeAt(index))) return false;
      hasDigits = true;
    }
    return hasDigits && ch !== "_";
  }
  if (ch === "_") return false;
  for (; index < max; index++) {
    ch = data2[index];
    if (ch === "_") continue;
    if (!isDecCode(data2.charCodeAt(index))) {
      return false;
    }
    hasDigits = true;
  }
  if (!hasDigits || ch === "_") return false;
  return /^(:[0-5]?[0-9])+$/.test(data2.slice(index));
}
function constructYamlInteger(data2) {
  let value = data2;
  if (value.includes("_")) {
    value = value.replace(/_/g, "");
  }
  let sign = 1;
  let ch = value[0];
  if (ch === "-" || ch === "+") {
    if (ch === "-") sign = -1;
    value = value.slice(1);
    ch = value[0];
  }
  if (value === "0") return 0;
  if (ch === "0") {
    if (value[1] === "b") return sign * parseInt(value.slice(2), 2);
    if (value[1] === "x") return sign * parseInt(value, 16);
    return sign * parseInt(value, 8);
  }
  return sign * parseInt(value, 10);
}
function isInteger(object) {
  if (object instanceof Number) object = object.valueOf();
  return typeof object === "number" && object % 1 === 0 && !isNegativeZero(object);
}
var int = {
  tag: "tag:yaml.org,2002:int",
  construct: constructYamlInteger,
  defaultStyle: "decimal",
  kind: "scalar",
  predicate: isInteger,
  represent: {
    // deno-lint-ignore ban-types
    binary(object) {
      const value = object instanceof Number ? object.valueOf() : object;
      return value >= 0 ? `0b${value.toString(2)}` : `-0b${value.toString(2).slice(1)}`;
    },
    // deno-lint-ignore ban-types
    octal(object) {
      const value = object instanceof Number ? object.valueOf() : object;
      return value >= 0 ? `0${value.toString(8)}` : `-0${value.toString(8).slice(1)}`;
    },
    // deno-lint-ignore ban-types
    decimal(object) {
      const value = object instanceof Number ? object.valueOf() : object;
      return value.toString(10);
    },
    // deno-lint-ignore ban-types
    hexadecimal(object) {
      const value = object instanceof Number ? object.valueOf() : object;
      return value >= 0 ? `0x${value.toString(16).toUpperCase()}` : `-0x${value.toString(16).toUpperCase().slice(1)}`;
    }
  },
  resolve: resolveYamlInteger
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/map.ts
var map = {
  tag: "tag:yaml.org,2002:map",
  resolve() {
    return true;
  },
  construct(data2) {
    return data2 !== null ? data2 : {};
  },
  kind: "mapping"
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/merge.ts
var merge = {
  tag: "tag:yaml.org,2002:merge",
  kind: "scalar",
  resolve: (data2) => data2 === "<<" || data2 === null,
  construct: (data2) => data2
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/nil.ts
var nil = {
  tag: "tag:yaml.org,2002:null",
  kind: "scalar",
  defaultStyle: "lowercase",
  predicate: (object) => object === null,
  construct: () => null,
  resolve: (data2) => {
    return data2 === "~" || data2 === "null" || data2 === "Null" || data2 === "NULL";
  },
  represent: {
    lowercase: () => "null",
    uppercase: () => "NULL",
    camelcase: () => "Null"
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/omap.ts
function resolveYamlOmap(data2) {
  const objectKeys = /* @__PURE__ */ new Set();
  for (const object of data2) {
    if (!isPlainObject(object)) return false;
    const keys = Object.keys(object);
    if (keys.length !== 1) return false;
    for (const key of keys) {
      if (objectKeys.has(key)) return false;
      objectKeys.add(key);
    }
  }
  return true;
}
var omap = {
  tag: "tag:yaml.org,2002:omap",
  kind: "sequence",
  resolve: resolveYamlOmap,
  construct(data2) {
    return data2;
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/pairs.ts
function resolveYamlPairs(data2) {
  if (data2 === null) return true;
  return data2.every((it) => isPlainObject(it) && Object.keys(it).length === 1);
}
var pairs = {
  tag: "tag:yaml.org,2002:pairs",
  construct(data2) {
    return data2?.flatMap(Object.entries) ?? [];
  },
  kind: "sequence",
  resolve: resolveYamlPairs
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/regexp.ts
var REGEXP = /^\/(?<regexp>[\s\S]+)\/(?<modifiers>[gismuy]*)$/;
var regexp = {
  tag: "tag:yaml.org,2002:js/regexp",
  kind: "scalar",
  resolve(data2) {
    if (data2 === null || !data2.length) return false;
    if (data2.charAt(0) === "/") {
      const groups = data2.match(REGEXP)?.groups;
      if (!groups) return false;
      const modifiers = groups.modifiers ?? "";
      if (new Set(modifiers).size < modifiers.length) return false;
    }
    return true;
  },
  construct(data2) {
    const { regexp: regexp2 = data2, modifiers = "" } = data2.match(REGEXP)?.groups ?? {};
    return new RegExp(regexp2, modifiers);
  },
  predicate: (object) => object instanceof RegExp,
  represent: (object) => object.toString()
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/seq.ts
var seq = {
  tag: "tag:yaml.org,2002:seq",
  kind: "sequence",
  resolve: () => true,
  construct: (data2) => data2 !== null ? data2 : []
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/set.ts
var set = {
  tag: "tag:yaml.org,2002:set",
  kind: "mapping",
  construct: (data2) => data2 !== null ? data2 : {},
  resolve: (data2) => {
    if (data2 === null) return true;
    return Object.values(data2).every((it) => it === null);
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/str.ts
var str = {
  tag: "tag:yaml.org,2002:str",
  kind: "scalar",
  resolve: () => true,
  construct: (data2) => data2 !== null ? data2 : ""
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/timestamp.ts
var YAML_DATE_REGEXP = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])$");
var YAML_TIMESTAMP_REGEXP = new RegExp("^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \\t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])(?:\\.([0-9]*))?(?:[ \\t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?$");
function resolveYamlTimestamp(data2) {
  if (data2 === null) return false;
  if (YAML_DATE_REGEXP.exec(data2) !== null) return true;
  if (YAML_TIMESTAMP_REGEXP.exec(data2) !== null) return true;
  return false;
}
function constructYamlTimestamp(data2) {
  let match = YAML_DATE_REGEXP.exec(data2);
  if (match === null) match = YAML_TIMESTAMP_REGEXP.exec(data2);
  if (match === null) {
    throw new Error("Cannot construct YAML timestamp: date resolve error");
  }
  const year = +match[1];
  const month = +match[2] - 1;
  const day = +match[3];
  if (!match[4]) {
    return new Date(Date.UTC(year, month, day));
  }
  const hour = +match[4];
  const minute = +match[5];
  const second = +match[6];
  let fraction = 0;
  if (match[7]) {
    let partFraction = match[7].slice(0, 3);
    while (partFraction.length < 3) {
      partFraction += "0";
    }
    fraction = +partFraction;
  }
  let delta = null;
  if (match[9] && match[10]) {
    const tzHour = +match[10];
    const tzMinute = +(match[11] || 0);
    delta = (tzHour * 60 + tzMinute) * 6e4;
    if (match[9] === "-") delta = -delta;
  }
  const date = new Date(Date.UTC(year, month, day, hour, minute, second, fraction));
  if (delta) date.setTime(date.getTime() - delta);
  return date;
}
function representYamlTimestamp(date) {
  return date.toISOString();
}
var timestamp = {
  tag: "tag:yaml.org,2002:timestamp",
  construct: constructYamlTimestamp,
  predicate(object) {
    return object instanceof Date;
  },
  kind: "scalar",
  represent: representYamlTimestamp,
  resolve: resolveYamlTimestamp
};

// deno:https://jsr.io/@std/yaml/1.0.9/_type/undefined.ts
var undefinedType = {
  tag: "tag:yaml.org,2002:js/undefined",
  kind: "scalar",
  resolve() {
    return true;
  },
  construct() {
    return void 0;
  },
  predicate(object) {
    return typeof object === "undefined";
  },
  represent() {
    return "";
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/_schema.ts
function createTypeMap(implicitTypes, explicitTypes) {
  const result = {
    fallback: /* @__PURE__ */ new Map(),
    mapping: /* @__PURE__ */ new Map(),
    scalar: /* @__PURE__ */ new Map(),
    sequence: /* @__PURE__ */ new Map()
  };
  const fallbackMap = result.fallback;
  for (const type of [
    ...implicitTypes,
    ...explicitTypes
  ]) {
    const map2 = result[type.kind];
    map2.set(type.tag, type);
    fallbackMap.set(type.tag, type);
  }
  return result;
}
function createSchema({ explicitTypes = [], implicitTypes = [], include }) {
  if (include) {
    implicitTypes.push(...include.implicitTypes);
    explicitTypes.push(...include.explicitTypes);
  }
  const typeMap = createTypeMap(implicitTypes, explicitTypes);
  return {
    implicitTypes,
    explicitTypes,
    typeMap
  };
}
var FAILSAFE_SCHEMA = createSchema({
  explicitTypes: [
    str,
    seq,
    map
  ]
});
var JSON_SCHEMA = createSchema({
  implicitTypes: [
    nil,
    bool,
    int,
    float
  ],
  include: FAILSAFE_SCHEMA
});
var CORE_SCHEMA = createSchema({
  include: JSON_SCHEMA
});
var DEFAULT_SCHEMA = createSchema({
  explicitTypes: [
    binary,
    omap,
    pairs,
    set
  ],
  implicitTypes: [
    timestamp,
    merge
  ],
  include: CORE_SCHEMA
});
var EXTENDED_SCHEMA = createSchema({
  explicitTypes: [
    regexp,
    undefinedType
  ],
  include: DEFAULT_SCHEMA
});
var SCHEMA_MAP = /* @__PURE__ */ new Map([
  [
    "core",
    CORE_SCHEMA
  ],
  [
    "default",
    DEFAULT_SCHEMA
  ],
  [
    "failsafe",
    FAILSAFE_SCHEMA
  ],
  [
    "json",
    JSON_SCHEMA
  ],
  [
    "extended",
    EXTENDED_SCHEMA
  ]
]);

// deno:https://jsr.io/@std/yaml/1.0.9/_loader_state.ts
var CONTEXT_FLOW_IN = 1;
var CONTEXT_FLOW_OUT = 2;
var CONTEXT_BLOCK_IN = 3;
var CONTEXT_BLOCK_OUT = 4;
var CHOMPING_CLIP = 1;
var CHOMPING_STRIP = 2;
var CHOMPING_KEEP = 3;
var PATTERN_NON_PRINTABLE = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?:[^\uD800-\uDBFF]|^)[\uDC00-\uDFFF]/;
var PATTERN_NON_ASCII_LINE_BREAKS = /[\x85\u2028\u2029]/;
var PATTERN_FLOW_INDICATORS = /[,\[\]\{\}]/;
var PATTERN_TAG_HANDLE = /^(?:!|!!|![a-z\-]+!)$/i;
var PATTERN_TAG_URI = /^(?:!|[^,\[\]\{\}])(?:%[0-9a-f]{2}|[0-9a-z\-#;\/\?:@&=\+\$,_\.!~\*'\(\)\[\]])*$/i;
var ESCAPED_HEX_LENGTHS = /* @__PURE__ */ new Map([
  [
    120,
    2
  ],
  [
    117,
    4
  ],
  [
    85,
    8
  ]
]);
var SIMPLE_ESCAPE_SEQUENCES = /* @__PURE__ */ new Map([
  [
    48,
    "\0"
  ],
  [
    97,
    "\x07"
  ],
  [
    98,
    "\b"
  ],
  [
    116,
    "	"
  ],
  [
    9,
    "	"
  ],
  [
    110,
    "\n"
  ],
  [
    118,
    "\v"
  ],
  [
    102,
    "\f"
  ],
  [
    114,
    "\r"
  ],
  [
    101,
    "\x1B"
  ],
  [
    32,
    " "
  ],
  [
    34,
    '"'
  ],
  [
    47,
    "/"
  ],
  [
    92,
    "\\"
  ],
  [
    78,
    "\x85"
  ],
  [
    95,
    "\xA0"
  ],
  [
    76,
    "\u2028"
  ],
  [
    80,
    "\u2029"
  ]
]);
function hexCharCodeToNumber(charCode) {
  if (48 <= charCode && charCode <= 57) return charCode - 48;
  const lc = charCode | 32;
  if (97 <= lc && lc <= 102) return lc - 97 + 10;
  return -1;
}
function decimalCharCodeToNumber(charCode) {
  if (48 <= charCode && charCode <= 57) return charCode - 48;
  return -1;
}
function codepointToChar(codepoint) {
  if (codepoint <= 65535) return String.fromCharCode(codepoint);
  return String.fromCharCode((codepoint - 65536 >> 10) + 55296, (codepoint - 65536 & 1023) + 56320);
}
var INDENT = 4;
var MAX_LENGTH = 75;
var DELIMITERS = "\0\r\n\x85\u2028\u2029";
function getSnippet(buffer, position) {
  if (!buffer) return null;
  let start = position;
  let end = position;
  let head = "";
  let tail = "";
  while (start > 0 && !DELIMITERS.includes(buffer.charAt(start - 1))) {
    start--;
    if (position - start > MAX_LENGTH / 2 - 1) {
      head = " ... ";
      start += 5;
      break;
    }
  }
  while (end < buffer.length && !DELIMITERS.includes(buffer.charAt(end))) {
    end++;
    if (end - position > MAX_LENGTH / 2 - 1) {
      tail = " ... ";
      end -= 5;
      break;
    }
  }
  const snippet = buffer.slice(start, end);
  const indent = " ".repeat(INDENT);
  const caretIndent = " ".repeat(INDENT + position - start + head.length);
  return `${indent + head + snippet + tail}
${caretIndent}^`;
}
function markToString(buffer, position, line, column) {
  let where = `at line ${line + 1}, column ${column + 1}`;
  const snippet = getSnippet(buffer, position);
  if (snippet) where += `:
${snippet}`;
  return where;
}
var LoaderState = class {
  input;
  length;
  lineIndent = 0;
  lineStart = 0;
  position = 0;
  line = 0;
  onWarning;
  allowDuplicateKeys;
  implicitTypes;
  typeMap;
  checkLineBreaks = false;
  tagMap = /* @__PURE__ */ new Map();
  anchorMap = /* @__PURE__ */ new Map();
  tag;
  anchor;
  kind;
  result = "";
  constructor(input, { schema = DEFAULT_SCHEMA, onWarning, allowDuplicateKeys = false }) {
    this.input = input;
    this.onWarning = onWarning;
    this.allowDuplicateKeys = allowDuplicateKeys;
    this.implicitTypes = schema.implicitTypes;
    this.typeMap = schema.typeMap;
    this.length = input.length;
    this.readIndent();
  }
  skipWhitespaces() {
    let ch = this.peek();
    while (isWhiteSpace(ch)) {
      ch = this.next();
    }
  }
  skipComment() {
    let ch = this.peek();
    if (ch !== SHARP) return;
    ch = this.next();
    while (ch !== 0 && !isEOL(ch)) {
      ch = this.next();
    }
  }
  readIndent() {
    let char = this.peek();
    while (char === SPACE) {
      this.lineIndent += 1;
      char = this.next();
    }
  }
  peek(offset = 0) {
    return this.input.charCodeAt(this.position + offset);
  }
  next() {
    this.position += 1;
    return this.peek();
  }
  #createError(message) {
    const mark = markToString(this.input, this.position, this.line, this.position - this.lineStart);
    return new SyntaxError(`${message} ${mark}`);
  }
  dispatchWarning(message) {
    const error = this.#createError(message);
    this.onWarning?.(error);
  }
  yamlDirectiveHandler(args) {
    if (args.length !== 1) {
      throw this.#createError("Cannot handle YAML directive: YAML directive accepts exactly one argument");
    }
    const match = /^([0-9]+)\.([0-9]+)$/.exec(args[0]);
    if (match === null) {
      throw this.#createError("Cannot handle YAML directive: ill-formed argument");
    }
    const major = parseInt(match[1], 10);
    const minor = parseInt(match[2], 10);
    if (major !== 1) {
      throw this.#createError("Cannot handle YAML directive: unacceptable YAML version");
    }
    this.checkLineBreaks = minor < 2;
    if (minor !== 1 && minor !== 2) {
      this.dispatchWarning("Cannot handle YAML directive: unsupported YAML version");
    }
    return args[0] ?? null;
  }
  tagDirectiveHandler(args) {
    if (args.length !== 2) {
      throw this.#createError(`Cannot handle tag directive: directive accepts exactly two arguments, received ${args.length}`);
    }
    const handle = args[0];
    const prefix = args[1];
    if (!PATTERN_TAG_HANDLE.test(handle)) {
      throw this.#createError(`Cannot handle tag directive: ill-formed handle (first argument) in "${handle}"`);
    }
    if (this.tagMap.has(handle)) {
      throw this.#createError(`Cannot handle tag directive: previously declared suffix for "${handle}" tag handle`);
    }
    if (!PATTERN_TAG_URI.test(prefix)) {
      throw this.#createError("Cannot handle tag directive: ill-formed tag prefix (second argument) of the TAG directive");
    }
    this.tagMap.set(handle, prefix);
  }
  captureSegment(start, end, checkJson) {
    if (start < end) {
      const result = this.input.slice(start, end);
      if (checkJson) {
        for (let position = 0; position < result.length; position++) {
          const character = result.charCodeAt(position);
          if (!(character === 9 || 32 <= character && character <= 1114111)) {
            throw this.#createError(`Expected valid JSON character: received "${character}"`);
          }
        }
      } else if (PATTERN_NON_PRINTABLE.test(result)) {
        throw this.#createError("Stream contains non-printable characters");
      }
      this.result += result;
    }
  }
  readBlockSequence(nodeIndent) {
    let detected = false;
    const tag = this.tag;
    const anchor = this.anchor;
    const result = [];
    if (this.anchor !== null && typeof this.anchor !== "undefined") {
      this.anchorMap.set(this.anchor, result);
    }
    let ch = this.peek();
    while (ch !== 0) {
      if (ch !== MINUS) {
        break;
      }
      const following = this.peek(1);
      if (!isWhiteSpaceOrEOL(following)) {
        break;
      }
      detected = true;
      this.position++;
      if (this.skipSeparationSpace(true, -1)) {
        if (this.lineIndent <= nodeIndent) {
          result.push(null);
          ch = this.peek();
          continue;
        }
      }
      const line = this.line;
      this.composeNode({
        parentIndent: nodeIndent,
        nodeContext: CONTEXT_BLOCK_IN,
        allowToSeek: false,
        allowCompact: true
      });
      result.push(this.result);
      this.skipSeparationSpace(true, -1);
      ch = this.peek();
      if ((this.line === line || this.lineIndent > nodeIndent) && ch !== 0) {
        throw this.#createError("Cannot read block sequence: bad indentation of a sequence entry");
      } else if (this.lineIndent < nodeIndent) {
        break;
      }
    }
    if (detected) {
      this.tag = tag;
      this.anchor = anchor;
      this.kind = "sequence";
      this.result = result;
      return true;
    }
    return false;
  }
  mergeMappings(destination, source, overridableKeys) {
    if (!isObject(source)) {
      throw this.#createError("Cannot merge mappings: the provided source object is unacceptable");
    }
    for (const [key, value] of Object.entries(source)) {
      if (Object.hasOwn(destination, key)) continue;
      Object.defineProperty(destination, key, {
        value,
        writable: true,
        enumerable: true,
        configurable: true
      });
      overridableKeys.add(key);
    }
  }
  storeMappingPair(result, overridableKeys, keyTag, keyNode, valueNode, startLine, startPos) {
    if (Array.isArray(keyNode)) {
      keyNode = Array.prototype.slice.call(keyNode);
      for (let index = 0; index < keyNode.length; index++) {
        if (Array.isArray(keyNode[index])) {
          throw this.#createError("Cannot store mapping pair: nested arrays are not supported inside keys");
        }
        if (typeof keyNode === "object" && isPlainObject(keyNode[index])) {
          keyNode[index] = "[object Object]";
        }
      }
    }
    if (typeof keyNode === "object" && isPlainObject(keyNode)) {
      keyNode = "[object Object]";
    }
    keyNode = String(keyNode);
    if (keyTag === "tag:yaml.org,2002:merge") {
      if (Array.isArray(valueNode)) {
        for (let index = 0; index < valueNode.length; index++) {
          this.mergeMappings(result, valueNode[index], overridableKeys);
        }
      } else {
        this.mergeMappings(result, valueNode, overridableKeys);
      }
    } else {
      if (!this.allowDuplicateKeys && !overridableKeys.has(keyNode) && Object.hasOwn(result, keyNode)) {
        this.line = startLine || this.line;
        this.position = startPos || this.position;
        throw this.#createError("Cannot store mapping pair: duplicated key");
      }
      Object.defineProperty(result, keyNode, {
        value: valueNode,
        writable: true,
        enumerable: true,
        configurable: true
      });
      overridableKeys.delete(keyNode);
    }
    return result;
  }
  readLineBreak() {
    const ch = this.peek();
    if (ch === LINE_FEED) {
      this.position++;
    } else if (ch === CARRIAGE_RETURN) {
      this.position++;
      if (this.peek() === LINE_FEED) {
        this.position++;
      }
    } else {
      throw this.#createError("Cannot read line: line break not found");
    }
    this.line += 1;
    this.lineStart = this.position;
  }
  skipSeparationSpace(allowComments, checkIndent) {
    let lineBreaks = 0;
    let ch = this.peek();
    while (ch !== 0) {
      this.skipWhitespaces();
      ch = this.peek();
      if (allowComments) {
        this.skipComment();
        ch = this.peek();
      }
      if (isEOL(ch)) {
        this.readLineBreak();
        ch = this.peek();
        lineBreaks++;
        this.lineIndent = 0;
        this.readIndent();
        ch = this.peek();
      } else {
        break;
      }
    }
    if (checkIndent !== -1 && lineBreaks !== 0 && this.lineIndent < checkIndent) {
      this.dispatchWarning("deficient indentation");
    }
    return lineBreaks;
  }
  testDocumentSeparator() {
    let ch = this.peek();
    if ((ch === MINUS || ch === DOT) && ch === this.peek(1) && ch === this.peek(2)) {
      ch = this.peek(3);
      if (ch === 0 || isWhiteSpaceOrEOL(ch)) {
        return true;
      }
    }
    return false;
  }
  writeFoldedLines(count) {
    if (count === 1) {
      this.result += " ";
    } else if (count > 1) {
      this.result += "\n".repeat(count - 1);
    }
  }
  readPlainScalar(nodeIndent, withinFlowCollection) {
    const kind = this.kind;
    const result = this.result;
    let ch = this.peek();
    if (isWhiteSpaceOrEOL(ch) || isFlowIndicator(ch) || ch === SHARP || ch === AMPERSAND || ch === ASTERISK || ch === EXCLAMATION || ch === VERTICAL_LINE || ch === GREATER_THAN || ch === SINGLE_QUOTE || ch === DOUBLE_QUOTE || ch === PERCENT || ch === COMMERCIAL_AT || ch === GRAVE_ACCENT) {
      return false;
    }
    let following;
    if (ch === QUESTION || ch === MINUS) {
      following = this.peek(1);
      if (isWhiteSpaceOrEOL(following) || withinFlowCollection && isFlowIndicator(following)) {
        return false;
      }
    }
    this.kind = "scalar";
    this.result = "";
    let captureEnd = this.position;
    let captureStart = this.position;
    let hasPendingContent = false;
    let line = 0;
    while (ch !== 0) {
      if (ch === COLON) {
        following = this.peek(1);
        if (isWhiteSpaceOrEOL(following) || withinFlowCollection && isFlowIndicator(following)) {
          break;
        }
      } else if (ch === SHARP) {
        const preceding = this.peek(-1);
        if (isWhiteSpaceOrEOL(preceding)) {
          break;
        }
      } else if (this.position === this.lineStart && this.testDocumentSeparator() || withinFlowCollection && isFlowIndicator(ch)) {
        break;
      } else if (isEOL(ch)) {
        line = this.line;
        const lineStart = this.lineStart;
        const lineIndent = this.lineIndent;
        this.skipSeparationSpace(false, -1);
        if (this.lineIndent >= nodeIndent) {
          hasPendingContent = true;
          ch = this.peek();
          continue;
        } else {
          this.position = captureEnd;
          this.line = line;
          this.lineStart = lineStart;
          this.lineIndent = lineIndent;
          break;
        }
      }
      if (hasPendingContent) {
        this.captureSegment(captureStart, captureEnd, false);
        this.writeFoldedLines(this.line - line);
        captureStart = captureEnd = this.position;
        hasPendingContent = false;
      }
      if (!isWhiteSpace(ch)) {
        captureEnd = this.position + 1;
      }
      ch = this.next();
    }
    this.captureSegment(captureStart, captureEnd, false);
    if (this.result) {
      return true;
    }
    this.kind = kind;
    this.result = result;
    return false;
  }
  readSingleQuotedScalar(nodeIndent) {
    let ch = this.peek();
    if (ch !== SINGLE_QUOTE) {
      return false;
    }
    this.kind = "scalar";
    this.result = "";
    this.position++;
    let captureStart = this.position;
    let captureEnd = this.position;
    ch = this.peek();
    while (ch !== 0) {
      if (ch === SINGLE_QUOTE) {
        this.captureSegment(captureStart, this.position, true);
        ch = this.next();
        if (ch === SINGLE_QUOTE) {
          captureStart = this.position;
          this.position++;
          captureEnd = this.position;
        } else {
          return true;
        }
      } else if (isEOL(ch)) {
        this.captureSegment(captureStart, captureEnd, true);
        this.writeFoldedLines(this.skipSeparationSpace(false, nodeIndent));
        captureStart = captureEnd = this.position;
      } else if (this.position === this.lineStart && this.testDocumentSeparator()) {
        throw this.#createError("Unexpected end of the document within a single quoted scalar");
      } else {
        this.position++;
        captureEnd = this.position;
      }
      ch = this.peek();
    }
    throw this.#createError("Unexpected end of the stream within a single quoted scalar");
  }
  readDoubleQuotedScalar(nodeIndent) {
    let ch = this.peek();
    if (ch !== DOUBLE_QUOTE) {
      return false;
    }
    this.kind = "scalar";
    this.result = "";
    this.position++;
    let captureEnd = this.position;
    let captureStart = this.position;
    let tmp;
    ch = this.peek();
    while (ch !== 0) {
      if (ch === DOUBLE_QUOTE) {
        this.captureSegment(captureStart, this.position, true);
        this.position++;
        return true;
      }
      if (ch === BACKSLASH) {
        this.captureSegment(captureStart, this.position, true);
        ch = this.next();
        if (isEOL(ch)) {
          this.skipSeparationSpace(false, nodeIndent);
        } else if (ch < 256 && SIMPLE_ESCAPE_SEQUENCES.has(ch)) {
          this.result += SIMPLE_ESCAPE_SEQUENCES.get(ch);
          this.position++;
        } else if ((tmp = ESCAPED_HEX_LENGTHS.get(ch) ?? 0) > 0) {
          let hexLength = tmp;
          let hexResult = 0;
          for (; hexLength > 0; hexLength--) {
            ch = this.next();
            if ((tmp = hexCharCodeToNumber(ch)) >= 0) {
              hexResult = (hexResult << 4) + tmp;
            } else {
              throw this.#createError("Cannot read double quoted scalar: expected hexadecimal character");
            }
          }
          this.result += codepointToChar(hexResult);
          this.position++;
        } else {
          throw this.#createError("Cannot read double quoted scalar: unknown escape sequence");
        }
        captureStart = captureEnd = this.position;
      } else if (isEOL(ch)) {
        this.captureSegment(captureStart, captureEnd, true);
        this.writeFoldedLines(this.skipSeparationSpace(false, nodeIndent));
        captureStart = captureEnd = this.position;
      } else if (this.position === this.lineStart && this.testDocumentSeparator()) {
        throw this.#createError("Unexpected end of the document within a double quoted scalar");
      } else {
        this.position++;
        captureEnd = this.position;
      }
      ch = this.peek();
    }
    throw this.#createError("Unexpected end of the stream within a double quoted scalar");
  }
  readFlowCollection(nodeIndent) {
    let ch = this.peek();
    let terminator;
    let isMapping = true;
    let result = {};
    if (ch === LEFT_SQUARE_BRACKET) {
      terminator = RIGHT_SQUARE_BRACKET;
      isMapping = false;
      result = [];
    } else if (ch === LEFT_CURLY_BRACKET) {
      terminator = RIGHT_CURLY_BRACKET;
    } else {
      return false;
    }
    if (this.anchor !== null && typeof this.anchor !== "undefined") {
      this.anchorMap.set(this.anchor, result);
    }
    ch = this.next();
    const tag = this.tag;
    const anchor = this.anchor;
    let readNext = true;
    let valueNode = null;
    let keyNode = null;
    let keyTag = null;
    let isExplicitPair = false;
    let isPair = false;
    let following = 0;
    let line = 0;
    const overridableKeys = /* @__PURE__ */ new Set();
    while (ch !== 0) {
      this.skipSeparationSpace(true, nodeIndent);
      ch = this.peek();
      if (ch === terminator) {
        this.position++;
        this.tag = tag;
        this.anchor = anchor;
        this.kind = isMapping ? "mapping" : "sequence";
        this.result = result;
        return true;
      }
      if (!readNext) {
        throw this.#createError("Cannot read flow collection: missing comma between flow collection entries");
      }
      keyTag = keyNode = valueNode = null;
      isPair = isExplicitPair = false;
      if (ch === QUESTION) {
        following = this.peek(1);
        if (isWhiteSpaceOrEOL(following)) {
          isPair = isExplicitPair = true;
          this.position++;
          this.skipSeparationSpace(true, nodeIndent);
        }
      }
      line = this.line;
      this.composeNode({
        parentIndent: nodeIndent,
        nodeContext: CONTEXT_FLOW_IN,
        allowToSeek: false,
        allowCompact: true
      });
      keyTag = this.tag || null;
      keyNode = this.result;
      this.skipSeparationSpace(true, nodeIndent);
      ch = this.peek();
      if ((isExplicitPair || this.line === line) && ch === COLON) {
        isPair = true;
        ch = this.next();
        this.skipSeparationSpace(true, nodeIndent);
        this.composeNode({
          parentIndent: nodeIndent,
          nodeContext: CONTEXT_FLOW_IN,
          allowToSeek: false,
          allowCompact: true
        });
        valueNode = this.result;
      }
      if (isMapping) {
        this.storeMappingPair(result, overridableKeys, keyTag, keyNode, valueNode);
      } else if (isPair) {
        result.push(this.storeMappingPair({}, overridableKeys, keyTag, keyNode, valueNode));
      } else {
        result.push(keyNode);
      }
      this.skipSeparationSpace(true, nodeIndent);
      ch = this.peek();
      if (ch === COMMA) {
        readNext = true;
        ch = this.next();
      } else {
        readNext = false;
      }
    }
    throw this.#createError("Cannot read flow collection: unexpected end of the stream within a flow collection");
  }
  // Handles block scaler styles: e.g. '|', '>', '|-' and '>-'.
  // https://yaml.org/spec/1.2.2/#81-block-scalar-styles
  readBlockScalar(nodeIndent) {
    let chomping = CHOMPING_CLIP;
    let didReadContent = false;
    let detectedIndent = false;
    let textIndent = nodeIndent;
    let emptyLines = 0;
    let atMoreIndented = false;
    let ch = this.peek();
    let folding = false;
    if (ch === VERTICAL_LINE) {
      folding = false;
    } else if (ch === GREATER_THAN) {
      folding = true;
    } else {
      return false;
    }
    this.kind = "scalar";
    this.result = "";
    let tmp = 0;
    while (ch !== 0) {
      ch = this.next();
      if (ch === PLUS || ch === MINUS) {
        if (CHOMPING_CLIP === chomping) {
          chomping = ch === PLUS ? CHOMPING_KEEP : CHOMPING_STRIP;
        } else {
          throw this.#createError("Cannot read block: chomping mode identifier repeated");
        }
      } else if ((tmp = decimalCharCodeToNumber(ch)) >= 0) {
        if (tmp === 0) {
          throw this.#createError("Cannot read block: indentation width must be greater than 0");
        } else if (!detectedIndent) {
          textIndent = nodeIndent + tmp - 1;
          detectedIndent = true;
        } else {
          throw this.#createError("Cannot read block: indentation width identifier repeated");
        }
      } else {
        break;
      }
    }
    if (isWhiteSpace(ch)) {
      this.skipWhitespaces();
      this.skipComment();
      ch = this.peek();
    }
    while (ch !== 0) {
      this.readLineBreak();
      this.lineIndent = 0;
      ch = this.peek();
      while ((!detectedIndent || this.lineIndent < textIndent) && ch === SPACE) {
        this.lineIndent++;
        ch = this.next();
      }
      if (!detectedIndent && this.lineIndent > textIndent) {
        textIndent = this.lineIndent;
      }
      if (isEOL(ch)) {
        emptyLines++;
        continue;
      }
      if (this.lineIndent < textIndent) {
        if (chomping === CHOMPING_KEEP) {
          this.result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
        } else if (chomping === CHOMPING_CLIP) {
          if (didReadContent) {
            this.result += "\n";
          }
        }
        break;
      }
      if (folding) {
        if (isWhiteSpace(ch)) {
          atMoreIndented = true;
          this.result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
        } else if (atMoreIndented) {
          atMoreIndented = false;
          this.result += "\n".repeat(emptyLines + 1);
        } else if (emptyLines === 0) {
          if (didReadContent) {
            this.result += " ";
          }
        } else {
          this.result += "\n".repeat(emptyLines);
        }
      } else {
        this.result += "\n".repeat(didReadContent ? 1 + emptyLines : emptyLines);
      }
      didReadContent = true;
      detectedIndent = true;
      emptyLines = 0;
      const captureStart = this.position;
      while (!isEOL(ch) && ch !== 0) {
        ch = this.next();
      }
      this.captureSegment(captureStart, this.position, false);
    }
    return true;
  }
  readBlockMapping(nodeIndent, flowIndent) {
    const tag = this.tag;
    const anchor = this.anchor;
    const result = {};
    const overridableKeys = /* @__PURE__ */ new Set();
    let allowCompact = false;
    let line;
    let pos;
    let keyTag = null;
    let keyNode = null;
    let valueNode = null;
    let atExplicitKey = false;
    let detected = false;
    if (this.anchor !== null && typeof this.anchor !== "undefined") {
      this.anchorMap.set(this.anchor, result);
    }
    let ch = this.peek();
    while (ch !== 0) {
      const following = this.peek(1);
      line = this.line;
      pos = this.position;
      if ((ch === QUESTION || ch === COLON) && isWhiteSpaceOrEOL(following)) {
        if (ch === QUESTION) {
          if (atExplicitKey) {
            this.storeMappingPair(result, overridableKeys, keyTag, keyNode, null);
            keyTag = null;
            keyNode = null;
            valueNode = null;
          }
          detected = true;
          atExplicitKey = true;
          allowCompact = true;
        } else if (atExplicitKey) {
          atExplicitKey = false;
          allowCompact = true;
        } else {
          throw this.#createError("Cannot read block as explicit mapping pair is incomplete: a key node is missed or followed by a non-tabulated empty line");
        }
        this.position += 1;
        ch = following;
      } else if (this.composeNode({
        parentIndent: flowIndent,
        nodeContext: CONTEXT_FLOW_OUT,
        allowToSeek: false,
        allowCompact: true
      })) {
        if (this.line === line) {
          ch = this.peek();
          this.skipWhitespaces();
          ch = this.peek();
          if (ch === COLON) {
            ch = this.next();
            if (!isWhiteSpaceOrEOL(ch)) {
              throw this.#createError("Cannot read block: a whitespace character is expected after the key-value separator within a block mapping");
            }
            if (atExplicitKey) {
              this.storeMappingPair(result, overridableKeys, keyTag, keyNode, null);
              keyTag = null;
              keyNode = null;
              valueNode = null;
            }
            detected = true;
            atExplicitKey = false;
            allowCompact = false;
            keyTag = this.tag;
            keyNode = this.result;
          } else if (detected) {
            throw this.#createError("Cannot read an implicit mapping pair: missing colon");
          } else {
            this.tag = tag;
            this.anchor = anchor;
            return true;
          }
        } else if (detected) {
          throw this.#createError("Cannot read a block mapping entry: a multiline key may not be an implicit key");
        } else {
          this.tag = tag;
          this.anchor = anchor;
          return true;
        }
      } else {
        break;
      }
      if (this.line === line || this.lineIndent > nodeIndent) {
        if (this.composeNode({
          parentIndent: nodeIndent,
          nodeContext: CONTEXT_BLOCK_OUT,
          allowToSeek: true,
          allowCompact
        })) {
          if (atExplicitKey) {
            keyNode = this.result;
          } else {
            valueNode = this.result;
          }
        }
        if (!atExplicitKey) {
          this.storeMappingPair(result, overridableKeys, keyTag, keyNode, valueNode, line, pos);
          keyTag = keyNode = valueNode = null;
        }
        this.skipSeparationSpace(true, -1);
        ch = this.peek();
      }
      if (this.lineIndent > nodeIndent && ch !== 0) {
        throw this.#createError("Cannot read block: bad indentation of a mapping entry");
      } else if (this.lineIndent < nodeIndent) {
        break;
      }
    }
    if (atExplicitKey) {
      this.storeMappingPair(result, overridableKeys, keyTag, keyNode, null);
    }
    if (detected) {
      this.tag = tag;
      this.anchor = anchor;
      this.kind = "mapping";
      this.result = result;
    }
    return detected;
  }
  readTagProperty() {
    let isVerbatim = false;
    let isNamed = false;
    let tagHandle = "";
    let tagName;
    let ch = this.peek();
    if (ch !== EXCLAMATION) return false;
    if (this.tag !== null) {
      throw this.#createError("Cannot read tag property: duplication of a tag property");
    }
    ch = this.next();
    if (ch === SMALLER_THAN) {
      isVerbatim = true;
      ch = this.next();
    } else if (ch === EXCLAMATION) {
      isNamed = true;
      tagHandle = "!!";
      ch = this.next();
    } else {
      tagHandle = "!";
    }
    let position = this.position;
    if (isVerbatim) {
      do {
        ch = this.next();
      } while (ch !== 0 && ch !== GREATER_THAN);
      if (this.position < this.length) {
        tagName = this.input.slice(position, this.position);
        ch = this.next();
      } else {
        throw this.#createError("Cannot read tag property: unexpected end of stream");
      }
    } else {
      while (ch !== 0 && !isWhiteSpaceOrEOL(ch)) {
        if (ch === EXCLAMATION) {
          if (!isNamed) {
            tagHandle = this.input.slice(position - 1, this.position + 1);
            if (!PATTERN_TAG_HANDLE.test(tagHandle)) {
              throw this.#createError("Cannot read tag property: named tag handle contains invalid characters");
            }
            isNamed = true;
            position = this.position + 1;
          } else {
            throw this.#createError("Cannot read tag property: tag suffix cannot contain an exclamation mark");
          }
        }
        ch = this.next();
      }
      tagName = this.input.slice(position, this.position);
      if (PATTERN_FLOW_INDICATORS.test(tagName)) {
        throw this.#createError("Cannot read tag property: tag suffix cannot contain flow indicator characters");
      }
    }
    if (tagName && !PATTERN_TAG_URI.test(tagName)) {
      throw this.#createError(`Cannot read tag property: invalid characters in tag name "${tagName}"`);
    }
    if (isVerbatim) {
      this.tag = tagName;
    } else if (this.tagMap.has(tagHandle)) {
      this.tag = this.tagMap.get(tagHandle) + tagName;
    } else if (tagHandle === "!") {
      this.tag = `!${tagName}`;
    } else if (tagHandle === "!!") {
      this.tag = `tag:yaml.org,2002:${tagName}`;
    } else {
      throw this.#createError(`Cannot read tag property: undeclared tag handle "${tagHandle}"`);
    }
    return true;
  }
  readAnchorProperty() {
    let ch = this.peek();
    if (ch !== AMPERSAND) return false;
    if (this.anchor !== null) {
      throw this.#createError("Cannot read anchor property: duplicate anchor property");
    }
    ch = this.next();
    const position = this.position;
    while (ch !== 0 && !isWhiteSpaceOrEOL(ch) && !isFlowIndicator(ch)) {
      ch = this.next();
    }
    if (this.position === position) {
      throw this.#createError("Cannot read anchor property: name of an anchor node must contain at least one character");
    }
    this.anchor = this.input.slice(position, this.position);
    return true;
  }
  readAlias() {
    if (this.peek() !== ASTERISK) return false;
    let ch = this.next();
    const position = this.position;
    while (ch !== 0 && !isWhiteSpaceOrEOL(ch) && !isFlowIndicator(ch)) {
      ch = this.next();
    }
    if (this.position === position) {
      throw this.#createError("Cannot read alias: alias name must contain at least one character");
    }
    const alias = this.input.slice(position, this.position);
    if (!this.anchorMap.has(alias)) {
      throw this.#createError(`Cannot read alias: unidentified alias "${alias}"`);
    }
    this.result = this.anchorMap.get(alias);
    this.skipSeparationSpace(true, -1);
    return true;
  }
  composeNode({ parentIndent, nodeContext, allowToSeek, allowCompact }) {
    let indentStatus = 1;
    let atNewLine = false;
    let hasContent = false;
    let type;
    this.tag = null;
    this.anchor = null;
    this.kind = null;
    this.result = null;
    const allowBlockScalars = CONTEXT_BLOCK_OUT === nodeContext || CONTEXT_BLOCK_IN === nodeContext;
    let allowBlockCollections = allowBlockScalars;
    const allowBlockStyles = allowBlockScalars;
    if (allowToSeek) {
      if (this.skipSeparationSpace(true, -1)) {
        atNewLine = true;
        if (this.lineIndent > parentIndent) {
          indentStatus = 1;
        } else if (this.lineIndent === parentIndent) {
          indentStatus = 0;
        } else if (this.lineIndent < parentIndent) {
          indentStatus = -1;
        }
      }
    }
    if (indentStatus === 1) {
      while (this.readTagProperty() || this.readAnchorProperty()) {
        if (this.skipSeparationSpace(true, -1)) {
          atNewLine = true;
          allowBlockCollections = allowBlockStyles;
          if (this.lineIndent > parentIndent) {
            indentStatus = 1;
          } else if (this.lineIndent === parentIndent) {
            indentStatus = 0;
          } else if (this.lineIndent < parentIndent) {
            indentStatus = -1;
          }
        } else {
          allowBlockCollections = false;
        }
      }
    }
    if (allowBlockCollections) {
      allowBlockCollections = atNewLine || allowCompact;
    }
    if (indentStatus === 1 || CONTEXT_BLOCK_OUT === nodeContext) {
      const cond = CONTEXT_FLOW_IN === nodeContext || CONTEXT_FLOW_OUT === nodeContext;
      const flowIndent = cond ? parentIndent : parentIndent + 1;
      const blockIndent = this.position - this.lineStart;
      if (indentStatus === 1) {
        if (allowBlockCollections && (this.readBlockSequence(blockIndent) || this.readBlockMapping(blockIndent, flowIndent)) || this.readFlowCollection(flowIndent)) {
          hasContent = true;
        } else {
          if (allowBlockScalars && this.readBlockScalar(flowIndent) || this.readSingleQuotedScalar(flowIndent) || this.readDoubleQuotedScalar(flowIndent)) {
            hasContent = true;
          } else if (this.readAlias()) {
            hasContent = true;
            if (this.tag !== null || this.anchor !== null) {
              throw this.#createError("Cannot compose node: alias node should not have any properties");
            }
          } else if (this.readPlainScalar(flowIndent, CONTEXT_FLOW_IN === nodeContext)) {
            hasContent = true;
            if (this.tag === null) {
              this.tag = "?";
            }
          }
          if (this.anchor !== null) {
            this.anchorMap.set(this.anchor, this.result);
          }
        }
      } else if (indentStatus === 0) {
        hasContent = allowBlockCollections && this.readBlockSequence(blockIndent);
      }
    }
    if (this.tag !== null && this.tag !== "!") {
      if (this.tag === "?") {
        for (let typeIndex = 0; typeIndex < this.implicitTypes.length; typeIndex++) {
          type = this.implicitTypes[typeIndex];
          if (type.resolve(this.result)) {
            this.result = type.construct(this.result);
            this.tag = type.tag;
            if (this.anchor !== null) {
              this.anchorMap.set(this.anchor, this.result);
            }
            break;
          }
        }
      } else if (this.typeMap[this.kind ?? "fallback"].has(this.tag)) {
        const map2 = this.typeMap[this.kind ?? "fallback"];
        type = map2.get(this.tag);
        if (this.result !== null && type.kind !== this.kind) {
          throw this.#createError(`Unacceptable node kind for !<${this.tag}> tag: it should be "${type.kind}", not "${this.kind}"`);
        }
        if (!type.resolve(this.result)) {
          throw this.#createError(`Cannot resolve a node with !<${this.tag}> explicit tag`);
        } else {
          this.result = type.construct(this.result);
          if (this.anchor !== null) {
            this.anchorMap.set(this.anchor, this.result);
          }
        }
      } else {
        throw this.#createError(`Cannot resolve unknown tag !<${this.tag}>`);
      }
    }
    return this.tag !== null || this.anchor !== null || hasContent;
  }
  readDirectives() {
    let hasDirectives = false;
    let version = null;
    let ch = this.peek();
    while (ch !== 0) {
      this.skipSeparationSpace(true, -1);
      ch = this.peek();
      if (this.lineIndent > 0 || ch !== PERCENT) {
        break;
      }
      hasDirectives = true;
      ch = this.next();
      let position = this.position;
      while (ch !== 0 && !isWhiteSpaceOrEOL(ch)) {
        ch = this.next();
      }
      const directiveName = this.input.slice(position, this.position);
      const directiveArgs = [];
      if (directiveName.length < 1) {
        throw this.#createError("Cannot read document: directive name length must be greater than zero");
      }
      while (ch !== 0) {
        this.skipWhitespaces();
        this.skipComment();
        ch = this.peek();
        if (isEOL(ch)) break;
        position = this.position;
        while (ch !== 0 && !isWhiteSpaceOrEOL(ch)) {
          ch = this.next();
        }
        directiveArgs.push(this.input.slice(position, this.position));
      }
      if (ch !== 0) this.readLineBreak();
      switch (directiveName) {
        case "YAML":
          if (version !== null) {
            throw this.#createError("Cannot handle YAML directive: duplication of %YAML directive");
          }
          version = this.yamlDirectiveHandler(directiveArgs);
          break;
        case "TAG":
          this.tagDirectiveHandler(directiveArgs);
          break;
        default:
          this.dispatchWarning(`unknown document directive "${directiveName}"`);
          break;
      }
      ch = this.peek();
    }
    return hasDirectives;
  }
  readDocument() {
    const documentStart = this.position;
    this.checkLineBreaks = false;
    this.tagMap = /* @__PURE__ */ new Map();
    this.anchorMap = /* @__PURE__ */ new Map();
    const hasDirectives = this.readDirectives();
    this.skipSeparationSpace(true, -1);
    if (this.lineIndent === 0 && this.peek() === MINUS && this.peek(1) === MINUS && this.peek(2) === MINUS) {
      this.position += 3;
      this.skipSeparationSpace(true, -1);
    } else if (hasDirectives) {
      throw this.#createError("Cannot read document: directives end mark is expected");
    }
    this.composeNode({
      parentIndent: this.lineIndent - 1,
      nodeContext: CONTEXT_BLOCK_OUT,
      allowToSeek: false,
      allowCompact: true
    });
    this.skipSeparationSpace(true, -1);
    if (this.checkLineBreaks && PATTERN_NON_ASCII_LINE_BREAKS.test(this.input.slice(documentStart, this.position))) {
      this.dispatchWarning("non-ASCII line breaks are interpreted as content");
    }
    if (this.position === this.lineStart && this.testDocumentSeparator()) {
      if (this.peek() === DOT) {
        this.position += 3;
        this.skipSeparationSpace(true, -1);
      }
    } else if (this.position < this.length - 1) {
      throw this.#createError("Cannot read document: end of the stream or a document separator is expected");
    }
    return this.result;
  }
  *readDocuments() {
    while (this.position < this.length - 1) {
      yield this.readDocument();
    }
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/parse.ts
function sanitizeInput(input) {
  input = String(input);
  if (input.length > 0) {
    if (!isEOL(input.charCodeAt(input.length - 1))) input += "\n";
    if (input.charCodeAt(0) === 65279) input = input.slice(1);
  }
  input += "\0";
  return input;
}
function parse4(content, options = {}) {
  content = sanitizeInput(content);
  const state = new LoaderState(content, {
    ...options,
    schema: SCHEMA_MAP.get(options.schema)
  });
  const documentGenerator = state.readDocuments();
  const document = documentGenerator.next().value;
  if (!documentGenerator.next().done) {
    throw new SyntaxError("Found more than 1 document in the stream: expected a single document");
  }
  return document ?? null;
}

// deno:https://jsr.io/@std/yaml/1.0.9/_dumper_state.ts
var STYLE_PLAIN = 1;
var STYLE_SINGLE = 2;
var STYLE_LITERAL = 3;
var STYLE_FOLDED = 4;
var STYLE_DOUBLE = 5;
var LEADING_SPACE_REGEXP = /^\n* /;
var ESCAPE_SEQUENCES = /* @__PURE__ */ new Map([
  [
    0,
    "\\0"
  ],
  [
    7,
    "\\a"
  ],
  [
    8,
    "\\b"
  ],
  [
    9,
    "\\t"
  ],
  [
    10,
    "\\n"
  ],
  [
    11,
    "\\v"
  ],
  [
    12,
    "\\f"
  ],
  [
    13,
    "\\r"
  ],
  [
    27,
    "\\e"
  ],
  [
    34,
    '\\"'
  ],
  [
    92,
    "\\\\"
  ],
  [
    133,
    "\\N"
  ],
  [
    160,
    "\\_"
  ],
  [
    8232,
    "\\L"
  ],
  [
    8233,
    "\\P"
  ]
]);
var DEPRECATED_BOOLEANS_SYNTAX = [
  "y",
  "Y",
  "yes",
  "Yes",
  "YES",
  "on",
  "On",
  "ON",
  "n",
  "N",
  "no",
  "No",
  "NO",
  "off",
  "Off",
  "OFF"
];
function charCodeToHexString(charCode) {
  const hexString = charCode.toString(16).toUpperCase();
  if (charCode <= 255) return `\\x${hexString.padStart(2, "0")}`;
  if (charCode <= 65535) return `\\u${hexString.padStart(4, "0")}`;
  if (charCode <= 4294967295) return `\\U${hexString.padStart(8, "0")}`;
  throw new Error("Code point within a string may not be greater than 0xFFFFFFFF");
}
function createStyleMap(map2) {
  const result = /* @__PURE__ */ new Map();
  for (let tag of Object.keys(map2)) {
    const style = String(map2[tag]);
    if (tag.slice(0, 2) === "!!") {
      tag = `tag:yaml.org,2002:${tag.slice(2)}`;
    }
    result.set(tag, style);
  }
  return result;
}
function indentString(string2, spaces) {
  const indent = " ".repeat(spaces);
  return string2.split("\n").map((line) => line.length ? indent + line : line).join("\n");
}
function generateNextLine(indent, level) {
  return `
${" ".repeat(indent * level)}`;
}
function isPrintable(c) {
  return 32 <= c && c <= 126 || 161 <= c && c <= 55295 && c !== 8232 && c !== 8233 || 57344 <= c && c <= 65533 && c !== BOM || 65536 <= c && c <= 1114111;
}
function isPlainSafe(c) {
  return isPrintable(c) && c !== BOM && c !== COMMA && c !== LEFT_SQUARE_BRACKET && c !== RIGHT_SQUARE_BRACKET && c !== LEFT_CURLY_BRACKET && c !== RIGHT_CURLY_BRACKET && c !== COLON && c !== SHARP;
}
function isPlainSafeFirst(c) {
  return isPlainSafe(c) && !isWhiteSpace(c) && c !== MINUS && c !== QUESTION && c !== AMPERSAND && c !== ASTERISK && c !== EXCLAMATION && c !== VERTICAL_LINE && c !== GREATER_THAN && c !== SINGLE_QUOTE && c !== DOUBLE_QUOTE && c !== PERCENT && c !== COMMERCIAL_AT && c !== GRAVE_ACCENT;
}
function needIndentIndicator(string2) {
  return LEADING_SPACE_REGEXP.test(string2);
}
function chooseScalarStyle(string2, singleLineOnly, indentPerLevel, lineWidth, implicitTypes, quoteStyle) {
  const shouldTrackWidth = lineWidth !== -1;
  let hasLineBreak = false;
  let hasFoldableLine = false;
  let previousLineBreak = -1;
  let plain = isPlainSafeFirst(string2.charCodeAt(0)) && !isWhiteSpace(string2.charCodeAt(string2.length - 1));
  let char;
  let i;
  if (singleLineOnly) {
    for (i = 0; i < string2.length; i++) {
      char = string2.charCodeAt(i);
      if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char);
    }
  } else {
    for (i = 0; i < string2.length; i++) {
      char = string2.charCodeAt(i);
      if (char === LINE_FEED) {
        hasLineBreak = true;
        if (shouldTrackWidth) {
          hasFoldableLine = hasFoldableLine || // Foldable line = too long, and not more-indented.
          i - previousLineBreak - 1 > lineWidth && string2[previousLineBreak + 1] !== " ";
          previousLineBreak = i;
        }
      } else if (!isPrintable(char)) {
        return STYLE_DOUBLE;
      }
      plain = plain && isPlainSafe(char);
    }
    hasFoldableLine = hasFoldableLine || shouldTrackWidth && i - previousLineBreak - 1 > lineWidth && string2[previousLineBreak + 1] !== " ";
  }
  if (!hasLineBreak && !hasFoldableLine) {
    return plain && !implicitTypes.some((type) => type.resolve(string2)) ? STYLE_PLAIN : quoteStyle === "'" ? STYLE_SINGLE : STYLE_DOUBLE;
  }
  if (indentPerLevel > 9 && needIndentIndicator(string2)) {
    return STYLE_DOUBLE;
  }
  return hasFoldableLine ? STYLE_FOLDED : STYLE_LITERAL;
}
function foldLine(line, width) {
  if (line === "" || line[0] === " ") return line;
  const breakRegExp = / [^ ]/g;
  let start = 0;
  let end;
  let curr = 0;
  let next = 0;
  const lines = [];
  for (const match of line.matchAll(breakRegExp)) {
    next = match.index;
    if (next - start > width) {
      end = curr > start ? curr : next;
      lines.push(line.slice(start, end));
      start = end + 1;
    }
    curr = next;
  }
  if (line.length - start > width && curr > start) {
    lines.push(line.slice(start, curr));
    lines.push(line.slice(curr + 1));
  } else {
    lines.push(line.slice(start));
  }
  return lines.join("\n");
}
function trimTrailingNewline(string2) {
  return string2.at(-1) === "\n" ? string2.slice(0, -1) : string2;
}
function foldString(string2, width) {
  const lineRe = /(\n+)([^\n]*)/g;
  let result = (() => {
    let nextLF = string2.indexOf("\n");
    nextLF = nextLF !== -1 ? nextLF : string2.length;
    lineRe.lastIndex = nextLF;
    return foldLine(string2.slice(0, nextLF), width);
  })();
  let prevMoreIndented = string2[0] === "\n" || string2[0] === " ";
  let moreIndented;
  let match;
  while (match = lineRe.exec(string2)) {
    const prefix = match[1];
    const line = match[2] || "";
    moreIndented = line[0] === " ";
    result += prefix + (!prevMoreIndented && !moreIndented && line !== "" ? "\n" : "") + foldLine(line, width);
    prevMoreIndented = moreIndented;
  }
  return result;
}
function escapeString(string2) {
  let result = "";
  let char;
  let nextChar;
  let escapeSeq;
  for (let i = 0; i < string2.length; i++) {
    char = string2.charCodeAt(i);
    if (char >= 55296 && char <= 56319) {
      nextChar = string2.charCodeAt(i + 1);
      if (nextChar >= 56320 && nextChar <= 57343) {
        result += charCodeToHexString((char - 55296) * 1024 + nextChar - 56320 + 65536);
        i++;
        continue;
      }
    }
    escapeSeq = ESCAPE_SEQUENCES.get(char);
    result += !escapeSeq && isPrintable(char) ? string2[i] : escapeSeq || charCodeToHexString(char);
  }
  return result;
}
function blockHeader(string2, indentPerLevel) {
  const indentIndicator = needIndentIndicator(string2) ? String(indentPerLevel) : "";
  const clip = string2[string2.length - 1] === "\n";
  const keep = clip && (string2[string2.length - 2] === "\n" || string2 === "\n");
  const chomp = keep ? "+" : clip ? "" : "-";
  return `${indentIndicator}${chomp}
`;
}
function inspectNode(object, objects, duplicateObjects) {
  if (!isObject(object)) return;
  if (objects.has(object)) {
    duplicateObjects.add(object);
    return;
  }
  objects.add(object);
  const entries = Array.isArray(object) ? object : Object.values(object);
  for (const value of entries) {
    inspectNode(value, objects, duplicateObjects);
  }
}
var DumperState = class {
  indent;
  arrayIndent;
  skipInvalid;
  flowLevel;
  sortKeys;
  lineWidth;
  useAnchors;
  compatMode;
  condenseFlow;
  implicitTypes;
  explicitTypes;
  duplicates = [];
  usedDuplicates = /* @__PURE__ */ new Set();
  styleMap = /* @__PURE__ */ new Map();
  quoteStyle;
  constructor({ schema = DEFAULT_SCHEMA, indent = 2, arrayIndent = true, skipInvalid = false, flowLevel = -1, styles = void 0, sortKeys = false, lineWidth = 80, useAnchors = true, compatMode = true, condenseFlow = false, quoteStyle = "'" }) {
    this.indent = Math.max(1, indent);
    this.arrayIndent = arrayIndent;
    this.skipInvalid = skipInvalid;
    this.flowLevel = flowLevel;
    if (styles) this.styleMap = createStyleMap(styles);
    this.sortKeys = sortKeys;
    this.lineWidth = lineWidth;
    this.useAnchors = useAnchors;
    this.compatMode = compatMode;
    this.condenseFlow = condenseFlow;
    this.implicitTypes = schema.implicitTypes;
    this.explicitTypes = schema.explicitTypes;
    this.quoteStyle = quoteStyle;
  }
  // Note: line breaking/folding is implemented for only the folded style.
  // NB. We drop the last trailing newline (if any) of a returned block scalar
  //  since the dumper adds its own newline. This always works:
  //    • No ending newline => unaffected; already using strip "-" chomping.
  //    • Ending newline    => removed then restored.
  //  Importantly, this keeps the "+" chomp indicator from gaining an extra line.
  stringifyScalar(string2, { level, isKey }) {
    if (string2.length === 0) {
      return "''";
    }
    if (this.compatMode && DEPRECATED_BOOLEANS_SYNTAX.includes(string2)) {
      return `'${string2}'`;
    }
    const indent = this.indent * Math.max(1, level);
    const lineWidth = this.lineWidth === -1 ? -1 : Math.max(Math.min(this.lineWidth, 40), this.lineWidth - indent);
    const singleLineOnly = isKey || // No block styles in flow mode.
    this.flowLevel > -1 && level >= this.flowLevel;
    const scalarStyle = chooseScalarStyle(string2, singleLineOnly, this.indent, lineWidth, this.implicitTypes, this.quoteStyle);
    switch (scalarStyle) {
      case STYLE_PLAIN:
        return string2;
      case STYLE_SINGLE:
        return `'${string2.replace(/'/g, "''")}'`;
      case STYLE_LITERAL:
        return `|${blockHeader(string2, this.indent)}${trimTrailingNewline(indentString(string2, indent))}`;
      case STYLE_FOLDED:
        return `>${blockHeader(string2, this.indent)}${trimTrailingNewline(indentString(foldString(string2, lineWidth), indent))}`;
      case STYLE_DOUBLE:
        return `"${escapeString(string2)}"`;
      default:
        throw new TypeError("Invalid scalar style should be unreachable: please file a bug report against Deno at https://github.com/denoland/std/issues");
    }
  }
  stringifyFlowSequence(array, { level }) {
    const results = [];
    for (const value of array) {
      const string2 = this.stringifyNode(value, {
        level,
        block: false,
        compact: false,
        isKey: false
      });
      if (string2 === null) continue;
      results.push(string2);
    }
    const separator = this.condenseFlow ? "," : ", ";
    return `[${results.join(separator)}]`;
  }
  stringifyBlockSequence(array, { level, compact }) {
    const whitespace = generateNextLine(this.indent, level);
    const prefix = compact ? "" : whitespace;
    const results = [];
    for (const value of array) {
      const string2 = this.stringifyNode(value, {
        level: level + 1,
        block: true,
        compact: true,
        isKey: false
      });
      if (string2 === null) continue;
      const linePrefix = LINE_FEED === string2.charCodeAt(0) ? "-" : "- ";
      results.push(`${linePrefix}${string2}`);
    }
    return results.length ? prefix + results.join(whitespace) : "[]";
  }
  stringifyFlowMapping(object, { level }) {
    const quote = this.condenseFlow ? '"' : "";
    const separator = this.condenseFlow ? ":" : ": ";
    const results = [];
    for (const [key, value] of Object.entries(object)) {
      const keyString = this.stringifyNode(key, {
        level,
        block: false,
        compact: false,
        isKey: false
      });
      if (keyString === null) continue;
      const valueString = this.stringifyNode(value, {
        level,
        block: false,
        compact: false,
        isKey: false
      });
      if (valueString === null) continue;
      const keyPrefix = keyString.length > 1024 ? "? " : "";
      results.push(quote + keyPrefix + keyString + quote + separator + valueString);
    }
    return `{${results.join(", ")}}`;
  }
  stringifyBlockMapping(object, { tag, level, compact }) {
    const keys = Object.keys(object);
    if (this.sortKeys === true) {
      keys.sort();
    } else if (typeof this.sortKeys === "function") {
      keys.sort(this.sortKeys);
    } else if (this.sortKeys) {
      throw new TypeError(`"sortKeys" must be a boolean or a function: received ${typeof this.sortKeys}`);
    }
    const separator = generateNextLine(this.indent, level);
    const results = [];
    for (const key of keys) {
      const value = object[key];
      const keyString = this.stringifyNode(key, {
        level: level + 1,
        block: true,
        compact: true,
        isKey: true
      });
      if (keyString === null) continue;
      const explicitPair = tag !== null && tag !== "?" || keyString.length > 1024;
      const valueString = this.stringifyNode(value, {
        level: level + 1,
        block: true,
        compact: explicitPair,
        isKey: false
      });
      if (valueString === null) continue;
      let pairBuffer = "";
      if (explicitPair) {
        pairBuffer += keyString.charCodeAt(0) === LINE_FEED ? "?" : "? ";
      }
      pairBuffer += keyString;
      if (explicitPair) pairBuffer += separator;
      pairBuffer += valueString.charCodeAt(0) === LINE_FEED ? ":" : ": ";
      pairBuffer += valueString;
      results.push(pairBuffer);
    }
    const prefix = compact ? "" : separator;
    return results.length ? prefix + results.join(separator) : "{}";
  }
  getTypeRepresentation(type, value) {
    if (!type.represent) return value;
    const style = this.styleMap.get(type.tag) ?? type.defaultStyle;
    if (typeof type.represent === "function") {
      return type.represent(value, style);
    }
    const represent = type.represent[style];
    if (!represent) {
      throw new TypeError(`!<${type.tag}> tag resolver accepts not "${style}" style`);
    }
    return represent(value, style);
  }
  detectType(value) {
    for (const type of this.implicitTypes) {
      if (type.predicate?.(value)) {
        value = this.getTypeRepresentation(type, value);
        return {
          tag: "?",
          value
        };
      }
    }
    for (const type of this.explicitTypes) {
      if (type.predicate?.(value)) {
        value = this.getTypeRepresentation(type, value);
        return {
          tag: type.tag,
          value
        };
      }
    }
    return {
      tag: null,
      value
    };
  }
  // Serializes `object` and writes it to global `result`.
  // Returns true on success, or false on invalid object.
  stringifyNode(value, { level, block, compact, isKey }) {
    const result = this.detectType(value);
    const tag = result.tag;
    value = result.value;
    if (block) {
      block = this.flowLevel < 0 || this.flowLevel > level;
    }
    if (typeof value === "string" || value instanceof String) {
      value = value instanceof String ? value.valueOf() : value;
      if (tag !== "?") {
        value = this.stringifyScalar(value, {
          level,
          isKey
        });
      }
    } else if (isObject(value)) {
      const duplicateIndex = this.duplicates.indexOf(value);
      const duplicate = duplicateIndex !== -1;
      if (duplicate) {
        if (this.usedDuplicates.has(value)) return `*ref_${duplicateIndex}`;
        this.usedDuplicates.add(value);
      }
      if (tag !== null && tag !== "?" || duplicate || this.indent !== 2 && level > 0) {
        compact = false;
      }
      if (Array.isArray(value)) {
        const arrayLevel = !this.arrayIndent && level > 0 ? level - 1 : level;
        if (block && value.length !== 0) {
          value = this.stringifyBlockSequence(value, {
            level: arrayLevel,
            compact
          });
          if (duplicate) {
            value = `&ref_${duplicateIndex}${value}`;
          }
        } else {
          value = this.stringifyFlowSequence(value, {
            level: arrayLevel
          });
          if (duplicate) {
            value = `&ref_${duplicateIndex} ${value}`;
          }
        }
      } else {
        if (block && Object.keys(value).length !== 0) {
          value = this.stringifyBlockMapping(value, {
            tag,
            level,
            compact
          });
          if (duplicate) {
            value = `&ref_${duplicateIndex}${value}`;
          }
        } else {
          value = this.stringifyFlowMapping(value, {
            level
          });
          if (duplicate) {
            value = `&ref_${duplicateIndex} ${value}`;
          }
        }
      }
    } else {
      if (this.skipInvalid) return null;
      throw new TypeError(`Cannot stringify ${typeof value}`);
    }
    if (tag !== null && tag !== "?") {
      value = `!<${tag}> ${value}`;
    }
    return value;
  }
  stringify(value) {
    if (this.useAnchors) {
      const values = /* @__PURE__ */ new Set();
      const duplicateObjects = /* @__PURE__ */ new Set();
      inspectNode(value, values, duplicateObjects);
      this.duplicates = [
        ...duplicateObjects
      ];
      this.usedDuplicates = /* @__PURE__ */ new Set();
    }
    const string2 = this.stringifyNode(value, {
      level: 0,
      block: true,
      compact: true,
      isKey: false
    });
    if (string2 !== null) {
      return `${string2}
`;
    }
    return "";
  }
};

// deno:https://jsr.io/@std/yaml/1.0.9/stringify.ts
function stringify(data2, options = {}) {
  const state = new DumperState({
    ...options,
    schema: SCHEMA_MAP.get(options.schema)
  });
  return state.stringify(data2);
}

// libs/errors.ts
var ErrorWithCause = class extends Error {
  cause;
  constructor(message, cause) {
    super(message);
    this.cause = cause;
  }
};

// libs/config.ts
function parseConfigFile(path) {
  return Result2.fromAsync(() => parseConfig(path)).mapError((error) => new ErrorWithCause(`Unable to read or parse config file`, error));
}
async function parseConfig(path) {
  const contents = await Deno.readTextFile(path);
  return parse4(contents);
}
function writeConfigFile(config, path) {
  return Result2.fromAsync(() => writeConfig(config, path)).mapError((error) => new ErrorWithCause(`Unable to write config file`, error));
}
async function writeConfig(config, path) {
  const yamlContent = stringify(config);
  await Deno.writeTextFile(path, yamlContent);
}

// libs/file.ts
async function isDir(path) {
  const stat2 = await Result2.fromAsyncCatching(() => Deno.stat(path));
  if (!stat2.ok) {
    return Result2.error(new ErrorWithCause(`directory is not exist: ${path}`, stat2.error));
  }
  if (!stat2.value.isDirectory) {
    return Result2.error(new Error(`not a directory: ${path}`));
  }
  return Result2.ok();
}
async function isDirectoryEmpty(dirPath) {
  return await Result2.fromAsyncCatching(async () => {
    for await (const entry of Deno.readDir(dirPath)) {
      if (!entry.name.startsWith(".")) {
        return false;
      }
    }
    return true;
  }).mapError((error) => new ErrorWithCause(`Failed to check if directory is empty`, error));
}

// deno:https://jsr.io/@std/internal/1.0.10/_os.ts
function checkWindows() {
  const global = globalThis;
  const os = global.Deno?.build?.os;
  return typeof os === "string" ? os === "windows" : global.navigator?.platform?.startsWith("Win") ?? global.process?.platform?.startsWith("win") ?? false;
}

// deno:https://jsr.io/@std/internal/1.0.10/os.ts
var isWindows2 = checkWindows();

// deno:https://jsr.io/@std/path/1.1.1/_common/assert_path.ts
function assertPath2(path) {
  if (typeof path !== "string") {
    throw new TypeError(`Path must be a string, received "${JSON.stringify(path)}"`);
  }
}

// deno:https://jsr.io/@std/path/1.1.1/_common/from_file_url.ts
function assertArg5(url) {
  url = url instanceof URL ? url : new URL(url);
  if (url.protocol !== "file:") {
    throw new TypeError(`URL must be a file URL: received "${url.protocol}"`);
  }
  return url;
}

// deno:https://jsr.io/@std/path/1.1.1/posix/from_file_url.ts
function fromFileUrl3(url) {
  url = assertArg5(url);
  return decodeURIComponent(url.pathname.replace(/%(?![0-9A-Fa-f]{2})/g, "%25"));
}

// deno:https://jsr.io/@std/path/1.1.1/_common/strip_trailing_separators.ts
function stripTrailingSeparators2(segment, isSep) {
  if (segment.length <= 1) {
    return segment;
  }
  let end = segment.length;
  for (let i = segment.length - 1; i > 0; i--) {
    if (isSep(segment.charCodeAt(i))) {
      end = i;
    } else {
      break;
    }
  }
  return segment.slice(0, end);
}

// deno:https://jsr.io/@std/path/1.1.1/_common/constants.ts
var CHAR_UPPERCASE_A2 = 65;
var CHAR_LOWERCASE_A2 = 97;
var CHAR_UPPERCASE_Z2 = 90;
var CHAR_LOWERCASE_Z2 = 122;
var CHAR_DOT2 = 46;
var CHAR_FORWARD_SLASH2 = 47;
var CHAR_BACKWARD_SLASH2 = 92;
var CHAR_COLON2 = 58;

// deno:https://jsr.io/@std/path/1.1.1/posix/_util.ts
function isPosixPathSeparator3(code2) {
  return code2 === CHAR_FORWARD_SLASH2;
}

// deno:https://jsr.io/@std/path/1.1.1/windows/_util.ts
function isPosixPathSeparator4(code2) {
  return code2 === CHAR_FORWARD_SLASH2;
}
function isPathSeparator2(code2) {
  return code2 === CHAR_FORWARD_SLASH2 || code2 === CHAR_BACKWARD_SLASH2;
}
function isWindowsDeviceRoot2(code2) {
  return code2 >= CHAR_LOWERCASE_A2 && code2 <= CHAR_LOWERCASE_Z2 || code2 >= CHAR_UPPERCASE_A2 && code2 <= CHAR_UPPERCASE_Z2;
}

// deno:https://jsr.io/@std/path/1.1.1/windows/from_file_url.ts
function fromFileUrl4(url) {
  url = assertArg5(url);
  let path = decodeURIComponent(url.pathname.replace(/\//g, "\\").replace(/%(?![0-9A-Fa-f]{2})/g, "%25")).replace(/^\\*([A-Za-z]:)(\\|$)/, "$1\\");
  if (url.hostname !== "") {
    path = `\\\\${url.hostname}${path}`;
  }
  return path;
}

// deno:https://jsr.io/@std/path/1.1.1/_common/dirname.ts
function assertArg6(path) {
  assertPath2(path);
  if (path.length === 0) return ".";
}

// deno:https://jsr.io/@std/path/1.1.1/posix/dirname.ts
function dirname4(path) {
  if (path instanceof URL) {
    path = fromFileUrl3(path);
  }
  assertArg6(path);
  let end = -1;
  let matchedNonSeparator = false;
  for (let i = path.length - 1; i >= 1; --i) {
    if (isPosixPathSeparator3(path.charCodeAt(i))) {
      if (matchedNonSeparator) {
        end = i;
        break;
      }
    } else {
      matchedNonSeparator = true;
    }
  }
  if (end === -1) {
    return isPosixPathSeparator3(path.charCodeAt(0)) ? "/" : ".";
  }
  return stripTrailingSeparators2(path.slice(0, end), isPosixPathSeparator3);
}

// deno:https://jsr.io/@std/path/1.1.1/windows/dirname.ts
function dirname5(path) {
  if (path instanceof URL) {
    path = fromFileUrl4(path);
  }
  assertArg6(path);
  const len = path.length;
  let rootEnd = -1;
  let end = -1;
  let matchedSlash = true;
  let offset = 0;
  const code2 = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator2(code2)) {
      rootEnd = offset = 1;
      if (isPathSeparator2(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) {
          if (isPathSeparator2(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          last = j;
          for (; j < len; ++j) {
            if (!isPathSeparator2(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) {
              if (isPathSeparator2(path.charCodeAt(j))) break;
            }
            if (j === len) {
              return path;
            }
            if (j !== last) {
              rootEnd = offset = j + 1;
            }
          }
        }
      }
    } else if (isWindowsDeviceRoot2(code2)) {
      if (path.charCodeAt(1) === CHAR_COLON2) {
        rootEnd = offset = 2;
        if (len > 2) {
          if (isPathSeparator2(path.charCodeAt(2))) rootEnd = offset = 3;
        }
      }
    }
  } else if (isPathSeparator2(code2)) {
    return path;
  }
  for (let i = len - 1; i >= offset; --i) {
    if (isPathSeparator2(path.charCodeAt(i))) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }
  if (end === -1) {
    if (rootEnd === -1) return ".";
    else end = rootEnd;
  }
  return stripTrailingSeparators2(path.slice(0, end), isPosixPathSeparator4);
}

// deno:https://jsr.io/@std/path/1.1.1/dirname.ts
function dirname6(path) {
  return isWindows2 ? dirname5(path) : dirname4(path);
}

// deno:https://jsr.io/@std/path/1.1.1/_common/normalize.ts
function assertArg8(path) {
  assertPath2(path);
  if (path.length === 0) return ".";
}

// deno:https://jsr.io/@std/path/1.1.1/_common/normalize_string.ts
function normalizeString2(path, allowAboveRoot, separator, isPathSeparator3) {
  let res = "";
  let lastSegmentLength = 0;
  let lastSlash = -1;
  let dots = 0;
  let code2;
  for (let i = 0; i <= path.length; ++i) {
    if (i < path.length) code2 = path.charCodeAt(i);
    else if (isPathSeparator3(code2)) break;
    else code2 = CHAR_FORWARD_SLASH2;
    if (isPathSeparator3(code2)) {
      if (lastSlash === i - 1 || dots === 1) {
      } else if (lastSlash !== i - 1 && dots === 2) {
        if (res.length < 2 || lastSegmentLength !== 2 || res.charCodeAt(res.length - 1) !== CHAR_DOT2 || res.charCodeAt(res.length - 2) !== CHAR_DOT2) {
          if (res.length > 2) {
            const lastSlashIndex = res.lastIndexOf(separator);
            if (lastSlashIndex === -1) {
              res = "";
              lastSegmentLength = 0;
            } else {
              res = res.slice(0, lastSlashIndex);
              lastSegmentLength = res.length - 1 - res.lastIndexOf(separator);
            }
            lastSlash = i;
            dots = 0;
            continue;
          } else if (res.length === 2 || res.length === 1) {
            res = "";
            lastSegmentLength = 0;
            lastSlash = i;
            dots = 0;
            continue;
          }
        }
        if (allowAboveRoot) {
          if (res.length > 0) res += `${separator}..`;
          else res = "..";
          lastSegmentLength = 2;
        }
      } else {
        if (res.length > 0) res += separator + path.slice(lastSlash + 1, i);
        else res = path.slice(lastSlash + 1, i);
        lastSegmentLength = i - lastSlash - 1;
      }
      lastSlash = i;
      dots = 0;
    } else if (code2 === CHAR_DOT2 && dots !== -1) {
      ++dots;
    } else {
      dots = -1;
    }
  }
  return res;
}

// deno:https://jsr.io/@std/path/1.1.1/posix/normalize.ts
function normalize4(path) {
  if (path instanceof URL) {
    path = fromFileUrl3(path);
  }
  assertArg8(path);
  const isAbsolute5 = isPosixPathSeparator3(path.charCodeAt(0));
  const trailingSeparator = isPosixPathSeparator3(path.charCodeAt(path.length - 1));
  path = normalizeString2(path, !isAbsolute5, "/", isPosixPathSeparator3);
  if (path.length === 0 && !isAbsolute5) path = ".";
  if (path.length > 0 && trailingSeparator) path += "/";
  if (isAbsolute5) return `/${path}`;
  return path;
}

// deno:https://jsr.io/@std/path/1.1.1/posix/join.ts
function join4(path, ...paths) {
  if (path === void 0) return ".";
  if (path instanceof URL) {
    path = fromFileUrl3(path);
  }
  paths = path ? [
    path,
    ...paths
  ] : paths;
  paths.forEach((path2) => assertPath2(path2));
  const joined = paths.filter((path2) => path2.length > 0).join("/");
  return joined === "" ? "." : normalize4(joined);
}

// deno:https://jsr.io/@std/path/1.1.1/windows/normalize.ts
function normalize5(path) {
  if (path instanceof URL) {
    path = fromFileUrl4(path);
  }
  assertArg8(path);
  const len = path.length;
  let rootEnd = 0;
  let device;
  let isAbsolute5 = false;
  const code2 = path.charCodeAt(0);
  if (len > 1) {
    if (isPathSeparator2(code2)) {
      isAbsolute5 = true;
      if (isPathSeparator2(path.charCodeAt(1))) {
        let j = 2;
        let last = j;
        for (; j < len; ++j) {
          if (isPathSeparator2(path.charCodeAt(j))) break;
        }
        if (j < len && j !== last) {
          const firstPart = path.slice(last, j);
          last = j;
          for (; j < len; ++j) {
            if (!isPathSeparator2(path.charCodeAt(j))) break;
          }
          if (j < len && j !== last) {
            last = j;
            for (; j < len; ++j) {
              if (isPathSeparator2(path.charCodeAt(j))) break;
            }
            if (j === len) {
              return `\\\\${firstPart}\\${path.slice(last)}\\`;
            } else if (j !== last) {
              device = `\\\\${firstPart}\\${path.slice(last, j)}`;
              rootEnd = j;
            }
          }
        }
      } else {
        rootEnd = 1;
      }
    } else if (isWindowsDeviceRoot2(code2)) {
      if (path.charCodeAt(1) === CHAR_COLON2) {
        device = path.slice(0, 2);
        rootEnd = 2;
        if (len > 2) {
          if (isPathSeparator2(path.charCodeAt(2))) {
            isAbsolute5 = true;
            rootEnd = 3;
          }
        }
      }
    }
  } else if (isPathSeparator2(code2)) {
    return "\\";
  }
  let tail;
  if (rootEnd < len) {
    tail = normalizeString2(path.slice(rootEnd), !isAbsolute5, "\\", isPathSeparator2);
  } else {
    tail = "";
  }
  if (tail.length === 0 && !isAbsolute5) tail = ".";
  if (tail.length > 0 && isPathSeparator2(path.charCodeAt(len - 1))) {
    tail += "\\";
  }
  if (device === void 0) {
    if (isAbsolute5) {
      if (tail.length > 0) return `\\${tail}`;
      else return "\\";
    }
    return tail;
  } else if (isAbsolute5) {
    if (tail.length > 0) return `${device}\\${tail}`;
    else return `${device}\\`;
  }
  return device + tail;
}

// deno:https://jsr.io/@std/path/1.1.1/windows/join.ts
function join5(path, ...paths) {
  if (path instanceof URL) {
    path = fromFileUrl4(path);
  }
  paths = path ? [
    path,
    ...paths
  ] : paths;
  paths.forEach((path2) => assertPath2(path2));
  paths = paths.filter((path2) => path2.length > 0);
  if (paths.length === 0) return ".";
  let needsReplace = true;
  let slashCount = 0;
  const firstPart = paths[0];
  if (isPathSeparator2(firstPart.charCodeAt(0))) {
    ++slashCount;
    const firstLen = firstPart.length;
    if (firstLen > 1) {
      if (isPathSeparator2(firstPart.charCodeAt(1))) {
        ++slashCount;
        if (firstLen > 2) {
          if (isPathSeparator2(firstPart.charCodeAt(2))) ++slashCount;
          else {
            needsReplace = false;
          }
        }
      }
    }
  }
  let joined = paths.join("\\");
  if (needsReplace) {
    for (; slashCount < joined.length; ++slashCount) {
      if (!isPathSeparator2(joined.charCodeAt(slashCount))) break;
    }
    if (slashCount >= 2) joined = `\\${joined.slice(slashCount)}`;
  }
  return normalize5(joined);
}

// deno:https://jsr.io/@std/path/1.1.1/join.ts
function join6(path, ...paths) {
  return isWindows2 ? join5(path, ...paths) : join4(path, ...paths);
}

// deno:https://jsr.io/@std/path/1.1.1/normalize.ts
function normalize6(path) {
  return isWindows2 ? normalize5(path) : normalize4(path);
}

// libs/concurrent.ts
async function processConcurrently(items, processor, concurrency = 4) {
  if (items.length === 0) {
    return Result2.ok();
  }
  const batches = [];
  for (let i = 0; i < items.length; i += concurrency) {
    batches.push(items.slice(i, i + concurrency));
  }
  for (const batch of batches) {
    const promises = batch.map((item) => processor(item));
    const results = await Promise.all(promises);
    for (const result of results) {
      if (!result.ok) {
        return result;
      }
    }
  }
  return Result2.ok();
}
async function processConcurrentlyWithResults(items, processor, concurrency = 4) {
  if (items.length === 0) {
    return [];
  }
  const batches = [];
  for (let i = 0; i < items.length; i += concurrency) {
    batches.push(items.slice(i, i + concurrency));
  }
  const allResults = [];
  for (const batch of batches) {
    const promises = batch.map((item) => processor(item));
    const results = await Promise.all(promises);
    allResults.push(...results);
  }
  return allResults;
}

// libs/git.ts
async function gitSubmoduleRemove(path, cwd) {
  const deInit = await gitDeInit(path, cwd);
  if (!deInit.ok) {
    return Result2.error(deInit.error);
  }
  const rm = await gitRm(path, cwd);
  if (!rm.ok) {
    return Result2.error(rm.error);
  }
  const gitModulePath = `${cwd}/.git/modules/${path}`;
  const stat2 = await Result2.fromAsyncCatching(() => Deno.stat(gitModulePath));
  if (!stat2.ok) {
    return Result2.ok(void 0);
  }
  if (stat2.value.isDirectory) {
    const remove = await Result2.fromAsyncCatching(() => Deno.remove(gitModulePath, {
      recursive: true
    }));
    if (!remove.ok) {
      return Result2.error(remove.error);
    }
  }
  return Result2.ok();
}
function gitDeInit(path, cwd) {
  return Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "submodule",
      "deinit",
      "-f",
      path
    ],
    cwd,
    stderr: "null"
  }).output());
}
function gitRm(path, cwd) {
  return Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "rm",
      "-f",
      path
    ],
    cwd,
    stderr: "null"
  }).output());
}
async function gitSubmoduleAddWithBranch(url, path, branch, workspaceRoot) {
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "submodule",
      "add",
      "--force",
      "-b",
      branch,
      url,
      path
    ],
    cwd: workspaceRoot,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to add submodule at ${path} with branch ${branch}`, error));
}
async function gitCheckoutBranch(branch, cwd) {
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "checkout",
      branch
    ],
    cwd,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to checkout to branch ${branch}`, error));
}
async function gitFetch(cwd) {
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "fetch",
      "origin"
    ],
    cwd,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to fetch latest changes from origin`, error));
}
async function gitIsWorkingDirectoryClean(cwd) {
  return await Result2.fromAsyncCatching(async () => {
    const result = await new Deno.Command("git", {
      args: [
        "status",
        "--porcelain"
      ],
      cwd,
      stderr: "null"
    }).output();
    const output = new TextDecoder().decode(result.stdout).trim();
    return output.length === 0;
  }).mapError((error) => new ErrorWithCause(`Failed to check git status`, error));
}
async function gitStash(cwd, message) {
  const args = [
    "stash",
    "push"
  ];
  if (message) {
    args.push("-m", message);
  }
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args,
    cwd,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to stash changes`, error));
}
async function gitStashPop(cwd) {
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "stash",
      "pop"
    ],
    cwd,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to pop stash`, error));
}
async function gitPullOriginBranch(branch, cwd) {
  return await Result2.fromAsyncCatching(() => new Deno.Command("git", {
    args: [
      "pull",
      "origin",
      branch
    ],
    cwd,
    stderr: "null"
  }).output()).mapError((error) => new ErrorWithCause(`Failed to pull latest changes from origin/${branch}`, error));
}
async function gitGetCurrentBranch(cwd) {
  return await Result2.fromAsyncCatching(async () => {
    const result = await new Deno.Command("git", {
      args: [
        "rev-parse",
        "--abbrev-ref",
        "HEAD"
      ],
      cwd,
      stderr: "null"
    }).output();
    return new TextDecoder().decode(result.stdout).trim();
  }).mapError((error) => new ErrorWithCause(`Failed to get current branch`, error));
}
async function gitIsRepository(cwd) {
  return await Result2.fromAsyncCatching(async () => {
    const result = await new Deno.Command("git", {
      args: [
        "rev-parse",
        "--git-dir"
      ],
      cwd,
      stderr: "null"
    }).output();
    return result.success;
  }).mapError((error) => new ErrorWithCause(`Failed to check if directory is a git repository`, error));
}

// libs/go.ts
async function isGoAvailable() {
  const result = await Result2.fromAsyncCatching(async () => {
    const command = new Deno.Command("go", {
      args: [
        "version"
      ],
      stdout: "piped",
      stderr: "piped"
    });
    return await command.output();
  });
  if (!result.ok) {
    return Result2.ok(false);
  }
  return Result2.ok(true);
}
async function goWorkInit(cwd) {
  const result = await Result2.fromAsyncCatching(async () => {
    const command = new Deno.Command("go", {
      args: [
        "work",
        "init"
      ],
      stdout: "piped",
      stderr: "piped",
      cwd
    });
    return await command.output();
  });
  if (!result.ok) {
    return Result2.error(new ErrorWithCause(`failed to run "go work init"`, result.error));
  }
  const stderr = new TextDecoder().decode(result.value.stderr).trim();
  if (stderr !== "" && !stderr.endsWith("go.work already exists")) {
    return Result2.error(new Error(`expected stderr to ends with "go.work already exists, got "${stderr}"`));
  }
  return Result2.ok();
}
async function goWorkUse(paths, cwd) {
  const result = await Result2.fromAsyncCatching(async () => {
    const command = new Deno.Command("go", {
      args: [
        "work",
        "use",
        ...paths
      ],
      stdout: "piped",
      stderr: "piped",
      cwd
    });
    return await command.output();
  });
  if (!result.ok) {
    return Result2.error(new ErrorWithCause(`failed to run "go work use"`, result.error));
  }
  if (result.value.code !== 0) {
    const stderr = new TextDecoder().decode(result.value.stderr);
    return Result2.error(new Error(stderr.trim()));
  }
  return Result2.ok();
}
async function goWorkRemove(paths, cwd) {
  for (const path of paths) {
    const result = await Result2.fromAsyncCatching(async () => {
      const command = new Deno.Command("go", {
        args: [
          "work",
          "edit",
          "-dropuse",
          path
        ],
        stdout: "piped",
        stderr: "piped",
        cwd
      });
      return await command.output();
    });
    if (!result.ok) {
      return Result2.error(new ErrorWithCause(`failed to run "go work edit -dropuse" for path: ${path}`, result.error));
    }
    if (result.value.code !== 0) {
      const stderr = new TextDecoder().decode(result.value.stderr);
      return Result2.error(new Error(`Failed to remove path "${path}": ${stderr.trim()}`));
    }
  }
  return Result2.ok();
}

// cmds/sync.ts
async function syncCommand(option) {
  const configFile = option.config ??= "workspace.yml";
  const workspaceRoot = option.workspaceRoot ??= ".";
  const debug = option.debug ?? false;
  const concurrency = option.concurrency ?? 4;
  const validated = await validateWorkspaceDir(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const activeWorkspaces = config.workspaces.filter((item) => item.active);
  const inactiveWorkspaces = config.workspaces.filter((item) => !item.active);
  const removeResult = await processConcurrently(inactiveWorkspaces, async (workspace) => {
    const workspacePath = join6(workspaceRoot, workspace.path);
    const dir = await isDir(workspacePath);
    if (!dir.ok) {
      return Result2.ok();
    }
    console.log(yellow(`\u{1F5D1}\uFE0F  Removing inactive workspace: ${workspace.path}`));
    const remove = await gitSubmoduleRemove(workspace.path, workspaceRoot);
    if (!remove.ok) {
      console.log(red(`\u274C Failed to remove inactive workspace: ${workspace.path}`), `(${remove.error.message})`);
      return Result2.error(remove.error);
    }
    console.log(green(`\u2705 Successfully removed inactive workspace: ${workspace.path}`));
    return Result2.ok();
  }, concurrency);
  if (!removeResult.ok) {
    return removeResult;
  }
  const checkoutResult = await processConcurrently(activeWorkspaces, async (workspace) => {
    const workspacePath = join6(workspaceRoot, workspace.path);
    const dir = await isDir(workspacePath);
    if (dir.ok) {
      console.log(blue(`\u{1F50D} Validating existing workspace: ${workspace.path}`));
      const healResult = await validateAndHealWorkspace(workspace, workspacePath);
      if (!healResult.ok) {
        return Result2.error(healResult.error);
      }
      if (healResult.value) {
        return Result2.ok();
      }
      console.log(yellow(`\u{1F5D1}\uFE0F  Removing corrupted workspace for fresh checkout: ${workspace.path}`));
      const removeResult2 = await gitSubmoduleRemove(workspace.path, workspaceRoot);
      if (!removeResult2.ok) {
        console.log(red(`\u274C Failed to remove corrupted workspace: ${workspace.path}`), `(${removeResult2.error.message})`);
        return Result2.error(removeResult2.error);
      }
    }
    console.log(yellow(`\u{1F4E5} Checking out workspace: ${workspace.path} from ${workspace.url} on branch ${workspace.branch}`));
    const updateResult = await gitSubmoduleAdd(workspace.url, workspace.path, workspace.branch, workspaceRoot);
    if (!updateResult.ok) {
      console.log(red(`\u274C Failed to checkout workspace: ${workspace.path}`), `(${updateResult.error.message})`);
      return Result2.error(updateResult.error);
    }
    console.log(green(`\u2705 Successfully checked out workspace: ${workspace.path}`));
    return Result2.ok();
  }, concurrency);
  if (!checkoutResult.ok) {
    return checkoutResult;
  }
  if (debug) {
    console.log(blue("\u{1F527} Setting up go workspace"));
  }
  const goWorkToRemove = inactiveWorkspaces.filter((w) => w.isGolang).map((w) => w.path);
  const goWorkToUse = activeWorkspaces.filter((w) => w.isGolang).map((w) => w.path);
  const goWorkspace = await setupGoWorkspace(goWorkToUse, goWorkToRemove, workspaceRoot);
  if (!goWorkspace.ok) {
    console.log(red("\u274C Failed to setup Go workspace: "), goWorkspace.error.message);
    return Result2.error(goWorkspace.error);
  }
  console.log(green("\u{1F389} Workspace sync completed successfully!"));
  return Result2.ok();
}
async function validateWorkspaceDir(path) {
  const stat2 = await Result2.fromAsyncCatching(() => Deno.stat(path));
  if (!stat2.ok) {
    return Result2.error(new ErrorWithCause(`Workspace directory is not a directory`, stat2.error));
  }
  if (!stat2.value.isDirectory) {
    return Result2.error(new Error(`Workspace directory is not a directory`));
  }
  return Result2.ok();
}
async function gitSubmoduleAdd(url, submodulePath, branch, workspaceRoot) {
  const addResult = await gitSubmoduleAddWithBranch(url, submodulePath, branch, workspaceRoot);
  if (!addResult.ok) {
    return Result2.error(addResult.error);
  }
  const fullSubmodulePath = join6(workspaceRoot, submodulePath);
  const checkoutResult = await gitCheckoutBranch(branch, fullSubmodulePath);
  if (!checkoutResult.ok) {
    return Result2.error(new ErrorWithCause(`Failed to checkout submodule at ${submodulePath} to branch ${branch}`, checkoutResult.error));
  }
  const pullResult = await gitPullOriginBranch(branch, fullSubmodulePath);
  if (!pullResult.ok) {
    return Result2.error(new ErrorWithCause(`Failed to pull latest changes for submodule at ${submodulePath} from branch ${branch}`, pullResult.error));
  }
  return Result2.ok();
}
async function validateAndHealWorkspace(workspace, workspacePath) {
  const isEmpty = await isDirectoryEmpty(workspacePath);
  if (!isEmpty.ok) {
    return Result2.error(isEmpty.error);
  }
  if (isEmpty.value) {
    console.log(yellow(`\u{1F4C1} Directory is empty, will perform full checkout: ${workspace.path}`));
    return Result2.ok(false);
  }
  const isRepo = await gitIsRepository(workspacePath);
  if (!isRepo.ok) {
    return Result2.error(isRepo.error);
  }
  if (!isRepo.value) {
    console.log(yellow(`\u{1F4C1} Directory is not a git repository, will perform full checkout: ${workspace.path}`));
    return Result2.ok(false);
  }
  const currentBranch = await gitGetCurrentBranch(workspacePath);
  if (!currentBranch.ok) {
    return Result2.error(currentBranch.error);
  }
  if (currentBranch.value !== workspace.branch) {
    const isClean = await gitIsWorkingDirectoryClean(workspacePath);
    if (!isClean.ok) {
      return Result2.error(isClean.error);
    }
    if (!isClean.value) {
      console.log(red(`\u26A0\uFE0F  Workspace has uncommitted changes on branch ${currentBranch.value}, cannot auto-heal: ${workspace.path}`));
      console.log(yellow(`   Please manually resolve conflicts or stash changes before running sync again.`));
      return Result2.error(new Error(`Workspace has uncommitted changes, manual intervention required`));
    }
    console.log(yellow(`\u{1F504} Switching from branch ${currentBranch.value} to ${workspace.branch}: ${workspace.path}`));
    const fetchResult = await gitFetch(workspacePath);
    if (!fetchResult.ok) {
      console.log(yellow(`\u26A0\uFE0F  Failed to fetch latest changes, continuing with checkout: ${fetchResult.error.message}`));
    }
    const checkoutResult = await gitCheckoutBranch(workspace.branch, workspacePath);
    if (!checkoutResult.ok) {
      console.log(red(`\u274C Failed to checkout to branch ${workspace.branch}: ${checkoutResult.error.message}`));
      return Result2.error(checkoutResult.error);
    }
  }
  console.log(blue(`\u{1F504} Pulling latest changes for workspace: ${workspace.path}`));
  const pullResult = await gitPullOriginBranch(workspace.branch, workspacePath);
  if (!pullResult.ok) {
    console.log(yellow(`\u26A0\uFE0F  Failed to pull latest changes: ${pullResult.error.message}`));
  }
  console.log(green(`\u2705 Workspace validated and healed: ${workspace.path}`));
  return Result2.ok(true);
}
async function setupGoWorkspace(add, remove, goWorkRoot) {
  const goAvailable = await isGoAvailable();
  if (!goAvailable.ok) {
    return Result2.error(new Error("Failed to check Go availability"));
  }
  if (!goAvailable.value) {
    return Result2.error(new Error("Go is not available."));
  }
  const initResult = await goWorkInit(goWorkRoot);
  if (!initResult.ok) {
    return Result2.error(initResult.error);
  }
  if (remove.length > 0) {
    const removeResult = await goWorkRemove(remove, goWorkRoot);
    if (!removeResult.ok) {
      return Result2.error(removeResult.error);
    }
  }
  if (add.length > 0) {
    const addResult = await goWorkUse(add, goWorkRoot);
    if (!addResult.ok) {
      return Result2.error(addResult.error);
    }
  }
  return Result2.ok();
}

// cmds/add.ts
async function addCommand(option) {
  const configFile = option.config ?? "workspace.yml";
  const workspaceRoot = option.workspaceRoot ?? ".";
  const debug = option.debug ?? false;
  const validated = await isDir(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const isNonInteractive = option.yes === true;
  if (isNonInteractive) {
    if (!option.repo) {
      console.log(red("\u274C Repository URL is required in non-interactive mode (-y)"));
      return Result2.error(new Error("Repository URL is required in non-interactive mode"));
    }
    const addResult = await addSingleWorkspace(config, configFile, option, debug);
    if (!addResult.ok) {
      return Result2.error(addResult.error);
    }
    if (option.sync) {
      const syncResult = await performSync(configFile, workspaceRoot, debug, option.concurrency ?? 4);
      if (!syncResult.ok) {
        return Result2.error(syncResult.error);
      }
    }
  } else {
    const interactiveResult = await runInteractiveMode(config, configFile, workspaceRoot, debug, option.concurrency ?? 4, option.repo);
    if (!interactiveResult.ok) {
      return Result2.error(interactiveResult.error);
    }
  }
  return Result2.ok();
}
async function addSingleWorkspace(config, configFile, option, debug) {
  const repo = option.repo;
  const defaultPath = extractRepoName(repo);
  const workspacePath = option.path ?? defaultPath;
  const branch = option.branch ?? "main";
  const isGolang = option.go ?? false;
  if (debug) {
    console.log(blue(`\u{1F4DD} Adding workspace: ${workspacePath} from ${repo}`));
  }
  const existingWorkspace = config.workspaces.find((w) => w.path === workspacePath || w.url === repo);
  if (existingWorkspace) {
    console.log(yellow(`\u26A0\uFE0F  Workspace already exists: ${existingWorkspace.path} (${existingWorkspace.url})`));
    return Result2.ok();
  }
  const newWorkspace = {
    url: repo,
    path: workspacePath,
    branch,
    isGolang,
    active: true
  };
  config.workspaces.push(newWorkspace);
  const writeResult = await writeConfigFile(config, configFile);
  if (!writeResult.ok) {
    console.log(red("\u274C Failed to write config file: "), configFile, `(${writeResult.error.message})`);
    return Result2.error(writeResult.error);
  }
  console.log(green(`\u2705 Successfully added workspace: ${workspacePath}`));
  return Result2.ok();
}
async function runInteractiveMode(config, configFile, workspaceRoot, debug, concurrency, defaultRepo) {
  let hasAddedWorkspaces = false;
  while (true) {
    console.log(blue("\n\u{1F4E6} Adding a new workspace repository"));
    const repoResult = await promptForRepo(defaultRepo);
    if (!repoResult.ok) {
      if (repoResult.error.message.includes("cancelled")) {
        console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
        break;
      }
      return Result2.error(repoResult.error);
    }
    const repo = repoResult.value;
    if (!repo || repo.trim() === "") {
      console.log(yellow("\u26A0\uFE0F  No repository URL provided"));
      continue;
    }
    const defaultPath = extractRepoName(repo);
    const pathResult = await promptForPath(defaultPath);
    if (!pathResult.ok) {
      if (pathResult.error.message.includes("cancelled")) {
        console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
        break;
      }
      return Result2.error(pathResult.error);
    }
    const workspacePath = pathResult.value || defaultPath;
    const branchResult = await promptForBranch();
    if (!branchResult.ok) {
      if (branchResult.error.message.includes("cancelled")) {
        console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
        break;
      }
      return Result2.error(branchResult.error);
    }
    const branch = branchResult.value || "main";
    const goResult = await promptForGo();
    if (!goResult.ok) {
      if (goResult.error.message.includes("cancelled")) {
        console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
        break;
      }
      return Result2.error(goResult.error);
    }
    const isGolang = goResult.value;
    const existingWorkspace = config.workspaces.find((w) => w.path === workspacePath || w.url === repo);
    if (existingWorkspace) {
      console.log(yellow(`\u26A0\uFE0F  Workspace already exists: ${existingWorkspace.path} (${existingWorkspace.url})`));
      continue;
    }
    const newWorkspace = {
      url: repo,
      path: workspacePath,
      branch,
      isGolang,
      active: true
    };
    config.workspaces.push(newWorkspace);
    hasAddedWorkspaces = true;
    const writeResult = await writeConfigFile(config, configFile);
    if (!writeResult.ok) {
      console.log(red("\u274C Failed to write config file: "), configFile, `(${writeResult.error.message})`);
      return Result2.error(writeResult.error);
    }
    console.log(green(`\u2705 Successfully added workspace: ${workspacePath}`));
    const continueResult = await promptForContinue();
    if (!continueResult.ok) {
      if (continueResult.error.message.includes("cancelled")) {
        console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
        break;
      }
      return Result2.error(continueResult.error);
    }
    if (!continueResult.value) {
      break;
    }
  }
  if (hasAddedWorkspaces) {
    const syncResult = await promptForSync();
    if (!syncResult.ok) {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
      return Result2.ok();
    }
    if (syncResult.value) {
      const performSyncResult = await performSync(configFile, workspaceRoot, debug, concurrency);
      if (!performSyncResult.ok) {
        return Result2.error(performSyncResult.error);
      }
    } else {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
    }
  }
  return Result2.ok();
}
function extractRepoName(repoUrl) {
  const patterns = [
    /\/([^/]+)\.git$/,
    /\/([^/]+)$/,
    /:([^/]+)\.git$/,
    /:([^/]+)$/
  ];
  for (const pattern of patterns) {
    const match = repoUrl.match(pattern);
    if (match) {
      return match[1];
    }
  }
  return repoUrl.split("/").pop()?.replace(".git", "") || "repository";
}
async function performSync(configFile, workspaceRoot, debug, concurrency) {
  const syncResult = await syncCommand({
    config: configFile,
    workspaceRoot,
    debug,
    concurrency
  });
  if (!syncResult.ok) {
    console.log(red("\u274C Sync failed:"), syncResult.error.message);
    return Result2.error(syncResult.error);
  }
  return Result2.ok();
}
function promptForRepo(defaultRepo) {
  return Result2.wrap(() => Input.prompt({
    message: "Repository URL:",
    default: defaultRepo,
    validate: (value) => {
      if (!value || value.trim() === "") {
        return "Repository URL is required";
      }
      return true;
    }
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for repository URL", error);
  })();
}
function promptForPath(defaultPath) {
  return Result2.wrap(() => Input.prompt({
    message: "Local path:",
    default: defaultPath
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for path", error);
  })();
}
function promptForBranch() {
  return Result2.wrap(() => Input.prompt({
    message: "Branch:",
    default: "main",
    suggestions: [
      "main",
      "master",
      "develop",
      "staging"
    ]
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for branch", error);
  })();
}
function promptForGo() {
  return Result2.wrap(() => Confirm.prompt({
    message: "Is this a Go module?",
    default: false
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for Go workspace setting", error);
  })();
}
function promptForContinue() {
  return Result2.wrap(() => Confirm.prompt({
    message: "Do you want to add another workspace?",
    default: false
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for continue", error);
  })();
}
function promptForSync() {
  return Result2.wrap(() => Confirm.prompt({
    message: "Do you want to sync now?",
    default: true
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for sync confirmation", error);
  })();
}

// deno:https://cdn.jsdelivr.net/gh/ball6847/deno-cliffy@442ed09e0b4822e7a45212a9796d8615d1feae85/prompt/_figures.ts
var main2 = {
  ARROW_UP: "\u2191",
  ARROW_DOWN: "\u2193",
  ARROW_LEFT: "\u2190",
  ARROW_RIGHT: "\u2192",
  ARROW_UP_LEFT: "\u2196",
  ARROW_UP_RIGHT: "\u2197",
  ARROW_DOWN_RIGHT: "\u2198",
  ARROW_DOWN_LEFT: "\u2199",
  RADIO_ON: "\u25C9",
  RADIO_OFF: "\u25EF",
  TICK: "\u2714",
  CROSS: "\u2718",
  ELLIPSIS: "\u2026",
  POINTER_SMALL: "\u203A",
  POINTER_SMALL_LEFT: "\u2039",
  LINE: "\u2500",
  POINTER: "\u276F",
  POINTER_LEFT: "\u276E",
  INFO: "\u2139",
  TAB_LEFT: "\u21E4",
  TAB_RIGHT: "\u21E5",
  ESCAPE: "\u238B",
  BACKSPACE: "\u232B",
  PAGE_UP: "\u21DE",
  PAGE_DOWN: "\u21DF",
  ENTER: "\u21B5",
  SEARCH: "\u{1F50E}",
  FOLDER: "\u{1F4C1}",
  FOLDER_OPEN: "\u{1F4C2}"
};
var win2 = {
  ...main2,
  RADIO_ON: "(*)",
  RADIO_OFF: "( )",
  TICK: "\u221A",
  CROSS: "\xD7",
  POINTER_SMALL: "\xBB"
};
var Figures2 = getOs() === "windows" ? win2 : main2;
var keyMap2 = {
  up: "ARROW_UP",
  down: "ARROW_DOWN",
  left: "ARROW_LEFT",
  right: "ARROW_RIGHT",
  pageup: "PAGE_UP",
  pagedown: "PAGE_DOWN",
  tab: "TAB_RIGHT",
  enter: "ENTER",
  return: "ENTER"
};
function getFiguresByKeys2(keys) {
  const figures = [];
  for (const key of keys) {
    const figure = Figures2[keyMap2[key]] ?? key;
    if (!figures.includes(figure)) {
      figures.push(figure);
    }
  }
  return figures;
}

// deno:https://cdn.jsdelivr.net/gh/ball6847/deno-cliffy@442ed09e0b4822e7a45212a9796d8615d1feae85/prompt/_generic_prompt.ts
var GenericPrompt2 = class _GenericPrompt {
  static injectedValue;
  cursor = {
    x: 0,
    y: 0
  };
  #value;
  #lastError;
  #isFirstRun = true;
  #encoder = new TextEncoder();
  /**
   * Inject prompt value. If called, the prompt doesn't prompt for an input and
   * returns immediately the injected value. Can be used for unit tests or pre
   * selections.
   *
   * @param value Input value.
   */
  static inject(value) {
    _GenericPrompt.injectedValue = value;
  }
  getDefaultSettings(options) {
    return {
      ...options,
      tty: tty({
        // Stdin is only used by getCursorPosition which we don't need.
        reader: {
          readSync,
          setRaw
        },
        writer: options.writer ?? {
          writeSync
        }
      }),
      cbreak: options.cbreak ?? false,
      reader: options.reader ?? {
        read,
        setRaw,
        isTerminal
      },
      writer: options.writer ?? {
        writeSync
      },
      pointer: options.pointer ?? brightBlue(Figures2.POINTER_SMALL),
      prefix: options.prefix ?? yellow("? "),
      indent: options.indent ?? "",
      keys: {
        submit: [
          "enter",
          "return"
        ],
        ...options.keys ?? {}
      }
    };
  }
  /** Execute the prompt. */
  async prompt() {
    try {
      return await this.#execute();
    } finally {
      this.settings.tty.cursorShow();
    }
  }
  /** Clear prompt output. */
  clear() {
    this.settings.tty.cursorLeft.eraseDown();
  }
  /** Execute the prompt. */
  #execute = async () => {
    if (typeof _GenericPrompt.injectedValue !== "undefined" && this.#lastError) {
      throw new Error(this.error());
    }
    await this.render();
    this.#lastError = void 0;
    if (!await this.read()) {
      return this.#execute();
    }
    if (typeof this.#value === "undefined") {
      throw new Error("internal error: failed to read value");
    }
    this.clear();
    const successMessage = this.success(this.#value);
    if (successMessage) {
      this.settings.writer.writeSync(this.#encoder.encode(successMessage + "\n"));
    }
    _GenericPrompt.injectedValue = void 0;
    this.settings.tty.cursorShow();
    return this.#value;
  };
  /** Render prompt. */
  async render() {
    const result = await Promise.all([
      this.message(),
      this.body?.(),
      this.footer()
    ]);
    const content = result.filter(Boolean).join("\n");
    const lines = content.split("\n");
    const columns = getColumns();
    const linesCount = columns ? lines.reduce((prev, next) => {
      const length = stripAnsiCode(next).length;
      return prev + (length > columns ? Math.ceil(length / columns) : 1);
    }, 0) : content.split("\n").length;
    const y = linesCount - this.cursor.y - 1;
    if (!this.#isFirstRun || this.#lastError) {
      this.clear();
    }
    this.#isFirstRun = false;
    this.settings.writer.writeSync(this.#encoder.encode(content));
    if (y) {
      this.settings.tty.cursorUp(y);
    }
    this.settings.tty.cursorTo(this.cursor.x);
  }
  /** Read user input from stdin, handle events and validate user input. */
  async read() {
    if (typeof _GenericPrompt.injectedValue !== "undefined") {
      const value = _GenericPrompt.injectedValue;
      await this.#validateValue(value);
    } else {
      const events = await this.#readKey();
      if (!events.length) {
        return false;
      }
      for (const event of events) {
        await this.handleEvent(event);
      }
    }
    return typeof this.#value !== "undefined";
  }
  submit() {
    return this.#validateValue(this.getValue());
  }
  message() {
    return `${this.settings.indent}${this.settings.prefix}` + bold(this.settings.message) + this.defaults();
  }
  defaults() {
    let defaultMessage = "";
    if (typeof this.settings.default !== "undefined" && !this.settings.hideDefault) {
      defaultMessage += dim(` (${this.format(this.settings.default)})`);
    }
    return defaultMessage;
  }
  /** Get prompt success message. */
  success(value) {
    return `${this.settings.indent}${this.settings.prefix}` + bold(this.settings.message) + this.defaults() + " " + this.settings.pointer + " " + green(this.format(value));
  }
  footer() {
    return this.error() ?? this.hint();
  }
  error() {
    return this.#lastError ? this.settings.indent + red(bold(`${Figures2.CROSS} `) + this.#lastError) : void 0;
  }
  hint() {
    return this.settings.hint ? this.settings.indent + italic(brightBlue(dim(`${Figures2.POINTER} `) + this.settings.hint)) : void 0;
  }
  setErrorMessage(message) {
    this.#lastError = message;
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case (event.name === "c" && event.ctrl):
        this.clear();
        this.settings.tty.cursorShow();
        exit(130);
        return;
      case this.isKey(this.settings.keys, "submit", event):
        await this.submit();
        break;
    }
  }
  /** Read user input from stdin and pars ansi codes. */
  #readKey = async () => {
    const data2 = await this.#readChar();
    return data2.length ? parse(data2) : [];
  };
  /** Read user input from stdin. */
  #readChar = async () => {
    const buffer = new Uint8Array(getRuntimeName() === "deno" ? 8 : 4096);
    const isTty = this.settings.reader.isTerminal();
    if (isTty) {
      this.settings.reader.setRaw(true, {
        cbreak: this.settings.cbreak
      });
    }
    const nread = await this.settings.reader.read(buffer);
    if (isTty) {
      this.settings.reader.setRaw(false);
    }
    if (nread === null) {
      return buffer;
    }
    return buffer.subarray(0, nread);
  };
  /**
   * Map input value to output value. If a custom transform handler ist set, the
   * custom handler will be executed, otherwise the default transform handler
   * from the prompt will be executed.
   * @param value The value to transform.
   */
  #transformValue = (value) => {
    return this.settings.transform ? this.settings.transform(value) : this.transform(value);
  };
  /**
   * Validate input value. Set error message if validation fails and transform
   * output value on success.
   * If a default value is set, the default will be used as value without any
   * validation.
   * If a custom validation handler ist set, the custom handler will
   * be executed, otherwise a prompt specific default validation handler will be
   * executed.
   * @param value The value to validate.
   */
  #validateValue = async (value) => {
    if (!value && typeof this.settings.default !== "undefined") {
      this.#value = this.settings.default;
      return;
    }
    this.#value = void 0;
    this.#lastError = void 0;
    const validation = await (this.settings.validate ? this.settings.validate(value) : this.validate(value));
    if (validation === false) {
      this.#lastError = `Invalid answer.`;
    } else if (typeof validation === "string") {
      this.#lastError = validation;
    } else {
      this.#value = this.#transformValue(value);
    }
  };
  /**
   * Check if key event has given name or sequence.
   * @param keys  Key map.
   * @param name  Key name.
   * @param event Key event.
   */
  isKey(keys, name, event) {
    const keyNames = keys?.[name];
    return typeof keyNames !== "undefined" && (typeof event.name !== "undefined" && keyNames.indexOf(event.name) !== -1 || typeof event.sequence !== "undefined" && keyNames.indexOf(event.sequence) !== -1);
  }
};

// deno:https://cdn.jsdelivr.net/gh/ball6847/deno-cliffy@442ed09e0b4822e7a45212a9796d8615d1feae85/prompt/_generic_input.ts
var GenericInput2 = class extends GenericPrompt2 {
  inputValue = "";
  inputIndex = 0;
  getDefaultSettings(options) {
    const settings = super.getDefaultSettings(options);
    return {
      ...settings,
      keys: {
        moveCursorLeft: [
          "left"
        ],
        moveCursorRight: [
          "right"
        ],
        deleteCharLeft: [
          "backspace"
        ],
        deleteCharRight: [
          "delete"
        ],
        ...settings.keys ?? {}
      }
    };
  }
  getCurrentInputValue() {
    return this.inputValue;
  }
  message() {
    const message = super.message() + " " + this.settings.pointer + " ";
    this.cursor.x = stripAnsiCode(message).length + this.inputIndex + 1;
    return message + this.input();
  }
  input() {
    return underline(this.inputValue);
  }
  highlight(value, color1 = dim, color2 = brightBlue) {
    value = value.toString();
    const inputLowerCase = this.getCurrentInputValue().toLowerCase();
    const valueLowerCase = value.toLowerCase();
    const index = valueLowerCase.indexOf(inputLowerCase);
    const matched = value.slice(index, index + inputLowerCase.length);
    return index >= 0 ? color1(value.slice(0, index)) + color2(matched) + color1(value.slice(index + inputLowerCase.length)) : value;
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case this.isKey(this.settings.keys, "moveCursorLeft", event):
        this.moveCursorLeft();
        break;
      case this.isKey(this.settings.keys, "moveCursorRight", event):
        this.moveCursorRight();
        break;
      case this.isKey(this.settings.keys, "deleteCharRight", event):
        this.deleteCharRight();
        break;
      case this.isKey(this.settings.keys, "deleteCharLeft", event):
        this.deleteChar();
        break;
      case (event.char && !event.meta && !event.ctrl):
        this.addChar(event.char);
        break;
      default:
        await super.handleEvent(event);
    }
  }
  /** Add character to current input. */
  addChar(char) {
    this.inputValue = this.inputValue.slice(0, this.inputIndex) + char + this.inputValue.slice(this.inputIndex);
    this.inputIndex++;
  }
  /** Move prompt cursor left. */
  moveCursorLeft() {
    if (this.inputIndex > 0) {
      this.inputIndex--;
    }
  }
  /** Move prompt cursor right. */
  moveCursorRight() {
    if (this.inputIndex < this.inputValue.length) {
      this.inputIndex++;
    }
  }
  /** Delete char left. */
  deleteChar() {
    if (this.inputIndex > 0) {
      this.inputIndex--;
      this.deleteCharRight();
    }
  }
  /** Delete char right. */
  deleteCharRight() {
    if (this.inputIndex < this.inputValue.length) {
      this.inputValue = this.inputValue.slice(0, this.inputIndex) + this.inputValue.slice(this.inputIndex + 1);
    }
  }
};

// deno:https://cdn.jsdelivr.net/gh/ball6847/deno-cliffy@442ed09e0b4822e7a45212a9796d8615d1feae85/prompt/_generic_suggestions.ts
var sep2 = getOs() === "windows" ? "\\" : "/";
var GenericSuggestions2 = class extends GenericInput2 {
  suggestionsIndex = -1;
  suggestionsOffset = 0;
  suggestions = [];
  #envPermissions = {};
  #hasReadPermissions;
  getDefaultSettings(options) {
    const settings = super.getDefaultSettings(options);
    return {
      ...settings,
      listPointer: options.listPointer ?? brightBlue(Figures2.POINTER),
      maxRows: options.maxRows ?? 8,
      keys: {
        complete: [
          "tab"
        ],
        next: [
          "up"
        ],
        previous: [
          "down"
        ],
        nextPage: [
          "pageup"
        ],
        previousPage: [
          "pagedown"
        ],
        ...settings.keys ?? {}
      }
    };
  }
  get localStorage() {
    if (this.settings.id && "localStorage" in window) {
      try {
        return window.localStorage;
      } catch (_) {
      }
    }
    return null;
  }
  loadSuggestions() {
    if (this.settings.id) {
      const json = this.localStorage?.getItem(this.settings.id);
      const suggestions = json ? JSON.parse(json) : [];
      if (!Array.isArray(suggestions)) {
        return [];
      }
      return suggestions;
    }
    return [];
  }
  saveSuggestions(...suggestions) {
    if (this.settings.id) {
      this.localStorage?.setItem(this.settings.id, JSON.stringify([
        ...suggestions,
        ...this.loadSuggestions()
      ].filter(uniqueSuggestions2)));
    }
  }
  async render() {
    if (this.settings.files && this.#hasReadPermissions === void 0) {
      const status = await globalThis.Deno?.permissions.request({
        name: "read"
      });
      this.#hasReadPermissions = !status || status.state === "granted";
    }
    if (this.#isFileModeEnabled()) {
      await this.#expandInputValue(this.inputValue);
    }
    await this.match();
    return super.render();
  }
  async match() {
    this.suggestions = await this.getSuggestions();
    this.suggestionsIndex = Math.max(this.getCurrentInputValue().trim().length === 0 ? -1 : 0, Math.min(this.suggestions.length - 1, this.suggestionsIndex));
    this.suggestionsOffset = Math.max(0, Math.min(this.suggestions.length - this.getListHeight(), this.suggestionsOffset));
  }
  input() {
    return super.input() + dim(this.getSuggestion());
  }
  getSuggestion() {
    return this.suggestions[this.suggestionsIndex]?.toString().substr(this.getCurrentInputValue().length) ?? "";
  }
  async getUserSuggestions(input) {
    return typeof this.settings.suggestions === "function" ? await this.settings.suggestions(input) : this.settings.suggestions ?? [];
  }
  #isFileModeEnabled() {
    return !!this.settings.files && this.#hasReadPermissions === true;
  }
  async getFileSuggestions(input) {
    if (!this.#isFileModeEnabled()) {
      return [];
    }
    const path = await stat(input).then((file) => file.isDirectory ? input : dirname6(input)).catch(() => dirname6(input));
    try {
      return await listDir2(path, this.settings.files);
    } catch (error) {
      if (error instanceof Deno.errors.NotFound || error instanceof Deno.errors.PermissionDenied) {
        this.setErrorMessage(error.message);
        return [];
      }
      throw error;
    }
  }
  async getSuggestions() {
    const input = this.getCurrentInputValue();
    const suggestions = [
      ...this.loadSuggestions(),
      ...await this.getUserSuggestions(input),
      ...await this.getFileSuggestions(input)
    ].filter(uniqueSuggestions2);
    if (!input.length) {
      return suggestions;
    }
    return suggestions.filter((value) => stripAnsiCode(value.toString()).toLowerCase().includes(input.toLowerCase())).sort((a, b) => levenshteinDistance((a || a).toString(), input) - levenshteinDistance((b || b).toString(), input));
  }
  body() {
    return this.getList() + this.getInfo();
  }
  getInfo() {
    if (!this.settings.info) {
      return "";
    }
    const selected = this.suggestionsIndex + 1;
    const matched = this.suggestions.length;
    const actions = [];
    if (this.suggestions.length) {
      if (this.settings.list) {
        actions.push([
          "Next",
          getFiguresByKeys2(this.settings.keys?.next ?? [])
        ], [
          "Previous",
          getFiguresByKeys2(this.settings.keys?.previous ?? [])
        ], [
          "Next Page",
          getFiguresByKeys2(this.settings.keys?.nextPage ?? [])
        ], [
          "Previous Page",
          getFiguresByKeys2(this.settings.keys?.previousPage ?? [])
        ]);
      } else {
        actions.push([
          "Next",
          getFiguresByKeys2(this.settings.keys?.next ?? [])
        ], [
          "Previous",
          getFiguresByKeys2(this.settings.keys?.previous ?? [])
        ]);
      }
      actions.push([
        "Complete",
        getFiguresByKeys2(this.settings.keys?.complete ?? [])
      ]);
    }
    actions.push([
      "Submit",
      getFiguresByKeys2(this.settings.keys?.submit ?? [])
    ]);
    let info = this.settings.indent;
    if (this.suggestions.length) {
      info += brightBlue(Figures2.INFO) + bold(` ${selected}/${matched} `);
    }
    info += actions.map((cur) => `${cur[0]}: ${bold(cur[1].join(" "))}`).join(", ");
    return info;
  }
  getList() {
    if (!this.suggestions.length || !this.settings.list) {
      return "";
    }
    const list = [];
    const height = this.getListHeight();
    for (let i = this.suggestionsOffset; i < this.suggestionsOffset + height; i++) {
      list.push(this.getListItem(this.suggestions[i], this.suggestionsIndex === i));
    }
    if (list.length && this.settings.info) {
      list.push("");
    }
    return list.join("\n");
  }
  /**
   * Render option.
   * @param value        Option.
   * @param isSelected  Set to true if option is selected.
   */
  getListItem(value, isSelected) {
    let line = this.settings.indent ?? "";
    line += isSelected ? `${this.settings.listPointer} ` : "  ";
    if (isSelected) {
      line += underline(this.highlight(value));
    } else {
      line += this.highlight(value);
    }
    return line;
  }
  /** Get suggestions row height. */
  getListHeight(suggestions = this.suggestions) {
    return Math.min(suggestions.length, this.settings.maxRows || suggestions.length);
  }
  /**
   * Handle user input event.
   * @param event Key event.
   */
  async handleEvent(event) {
    switch (true) {
      case this.isKey(this.settings.keys, "next", event):
        if (this.settings.list) {
          this.selectPreviousSuggestion();
        } else {
          this.selectNextSuggestion();
        }
        break;
      case this.isKey(this.settings.keys, "previous", event):
        if (this.settings.list) {
          this.selectNextSuggestion();
        } else {
          this.selectPreviousSuggestion();
        }
        break;
      case this.isKey(this.settings.keys, "nextPage", event):
        if (this.settings.list) {
          this.selectPreviousSuggestionsPage();
        } else {
          this.selectNextSuggestionsPage();
        }
        break;
      case this.isKey(this.settings.keys, "previousPage", event):
        if (this.settings.list) {
          this.selectNextSuggestionsPage();
        } else {
          this.selectPreviousSuggestionsPage();
        }
        break;
      case this.isKey(this.settings.keys, "complete", event):
        await this.#completeValue();
        break;
      case this.isKey(this.settings.keys, "moveCursorRight", event):
        if (this.inputIndex < this.inputValue.length) {
          this.moveCursorRight();
        } else {
          await this.#completeValue();
        }
        break;
      default:
        await super.handleEvent(event);
    }
  }
  /** Delete char right. */
  deleteCharRight() {
    if (this.inputIndex < this.inputValue.length) {
      super.deleteCharRight();
      if (!this.getCurrentInputValue().length) {
        this.suggestionsIndex = -1;
        this.suggestionsOffset = 0;
      }
    }
  }
  async #completeValue() {
    const inputValue = await this.complete();
    this.setInputValue(inputValue);
  }
  setInputValue(inputValue) {
    this.inputValue = inputValue;
    this.inputIndex = this.inputValue.length;
    this.suggestionsIndex = 0;
    this.suggestionsOffset = 0;
  }
  async complete() {
    let input = this.getCurrentInputValue();
    const suggestion = this.suggestions[this.suggestionsIndex]?.toString();
    if (this.settings.complete) {
      input = await this.settings.complete(input, suggestion);
    } else if (this.#isFileModeEnabled() && input.at(-1) !== sep2 && await isDirectory(input) && (this.getCurrentInputValue().at(-1) !== "." || this.getCurrentInputValue().endsWith(".."))) {
      input += sep2;
    } else if (suggestion) {
      input = suggestion;
    }
    return this.#isFileModeEnabled() ? normalize6(input) : input;
  }
  /** Select previous suggestion. */
  selectPreviousSuggestion() {
    if (this.suggestions.length) {
      if (this.suggestionsIndex > -1) {
        this.suggestionsIndex--;
        if (this.suggestionsIndex < this.suggestionsOffset) {
          this.suggestionsOffset--;
        }
      }
    }
  }
  /** Select next suggestion. */
  selectNextSuggestion() {
    if (this.suggestions.length) {
      if (this.suggestionsIndex < this.suggestions.length - 1) {
        this.suggestionsIndex++;
        if (this.suggestionsIndex >= this.suggestionsOffset + this.getListHeight()) {
          this.suggestionsOffset++;
        }
      }
    }
  }
  /** Select previous suggestions page. */
  selectPreviousSuggestionsPage() {
    if (this.suggestions.length) {
      const height = this.getListHeight();
      if (this.suggestionsOffset >= height) {
        this.suggestionsIndex -= height;
        this.suggestionsOffset -= height;
      } else if (this.suggestionsOffset > 0) {
        this.suggestionsIndex -= this.suggestionsOffset;
        this.suggestionsOffset = 0;
      }
    }
  }
  /** Select next suggestions page. */
  selectNextSuggestionsPage() {
    if (this.suggestions.length) {
      const height = this.getListHeight();
      if (this.suggestionsOffset + height + height < this.suggestions.length) {
        this.suggestionsIndex += height;
        this.suggestionsOffset += height;
      } else if (this.suggestionsOffset + height < this.suggestions.length) {
        const offset = this.suggestions.length - height;
        this.suggestionsIndex += offset - this.suggestionsOffset;
        this.suggestionsOffset = offset;
      }
    }
  }
  async #expandInputValue(path) {
    if (!path.startsWith("~")) {
      return;
    }
    const envVar = getHomeDirEnvVar2();
    const hasEnvPermissions = await this.#hasEnvPermissions(envVar);
    if (!hasEnvPermissions) {
      return;
    }
    const homeDir = getHomeDir2();
    if (homeDir) {
      path = path.replace("~", homeDir);
      this.setInputValue(path);
    }
  }
  async #hasEnvPermissions(variable) {
    if (this.#envPermissions[variable]) {
      return this.#envPermissions[variable];
    }
    const desc = {
      name: "env",
      variable
    };
    const currentStatus = await Deno.permissions.query(desc);
    this.#envPermissions[variable] = currentStatus.state === "granted";
    if (!this.#envPermissions[variable]) {
      this.clear();
      const newStatus = await Deno.permissions.request(desc);
      this.#envPermissions[variable] = newStatus.state === "granted";
    }
    return this.#envPermissions[variable];
  }
};
function uniqueSuggestions2(value, index, self) {
  return typeof value !== "undefined" && value !== "" && self.indexOf(value) === index;
}
async function listDir2(path, mode) {
  const fileNames = [];
  for (const file of await readDir(path)) {
    if (mode === true && (file.name.startsWith(".") || file.name.endsWith("~"))) {
      continue;
    }
    const filePath = join6(path, file.name);
    if (mode instanceof RegExp && !mode.test(filePath)) {
      continue;
    }
    fileNames.push(filePath);
  }
  return fileNames.sort(function(a, b) {
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
}
function getHomeDirEnvVar2() {
  return Deno.build.os === "windows" ? "USERPROFILE" : "HOME";
}
function getHomeDir2() {
  return Deno.env.get(getHomeDirEnvVar2());
}

// deno:https://cdn.jsdelivr.net/gh/ball6847/deno-cliffy@442ed09e0b4822e7a45212a9796d8615d1feae85/prompt/input.ts
var Input2 = class extends GenericSuggestions2 {
  settings;
  /** Execute the prompt with provided options. */
  static prompt(options) {
    return new this(options).prompt();
  }
  /**
   * Inject prompt value. If called, the prompt doesn't prompt for an input and
   * returns immediately the injected value. Can be used for unit tests or pre
   * selections.
   *
   * @param value Input value.
   */
  static inject(value) {
    GenericPrompt2.inject(value);
  }
  constructor(options) {
    super();
    if (typeof options === "string") {
      options = {
        message: options
      };
    }
    this.settings = this.getDefaultSettings(options);
  }
  getDefaultSettings(options) {
    return {
      ...super.getDefaultSettings(options),
      minLength: options.minLength ?? 0,
      maxLength: options.maxLength ?? Infinity
    };
  }
  success(value) {
    this.saveSuggestions(value);
    return super.success(value);
  }
  /** Get input value. */
  getValue() {
    return this.settings.files && this.inputValue ? normalize6(this.inputValue) : this.inputValue;
  }
  /**
   * Validate input value.
   * @param value User input value.
   * @return True on success, false or error message on error.
   */
  validate(value) {
    if (typeof value !== "string") {
      return false;
    }
    if (value.length < this.settings.minLength) {
      return `Value must be longer than ${this.settings.minLength} but has a length of ${value.length}.`;
    }
    if (value.length > this.settings.maxLength) {
      return `Value can't be longer than ${this.settings.maxLength} but has a length of ${value.length}.`;
    }
    return true;
  }
  /**
   * Map input value to output value.
   * @param value Input value.
   * @return Output value.
   */
  transform(value) {
    return value.trim();
  }
  /**
   * Format output value.
   * @param value Output value.
   */
  format(value) {
    return value;
  }
};

// cmds/disable.ts
async function disableCommand(option) {
  const configFile = option.config ?? "workspace.yml";
  const workspaceRoot = option.workspaceRoot ?? ".";
  const debug = option.debug ?? false;
  const autoSync = option.yes ?? false;
  const validated = await isDir(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const disableResult = await selectAndDisableWorkspace(config, configFile, debug);
  if (!disableResult.ok) {
    return Result2.error(disableResult.error);
  }
  const syncResult = await handleSyncConfirmation(autoSync, configFile, workspaceRoot, debug, option.concurrency ?? 4);
  if (!syncResult.ok) {
    return Result2.error(syncResult.error);
  }
  return Result2.ok();
}
async function selectAndDisableWorkspace(config, configFile, debug) {
  const activeWorkspaces = config.workspaces.filter((item) => item.active);
  if (activeWorkspaces.length === 0) {
    console.log(yellow("\u26A0\uFE0F  No active workspaces found"));
    return Result2.ok();
  }
  if (debug) {
    console.log(blue(`\u{1F4CA} Found ${activeWorkspaces.length} active workspaces`));
  }
  const suggestions = activeWorkspaces.map((workspace) => `${workspace.path} (${workspace.url})`);
  const selectedWorkspaceResult = await promptWorkspaceSelection(suggestions);
  if (!selectedWorkspaceResult.ok) {
    if (selectedWorkspaceResult.error.message.includes("cancelled")) {
      console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
      return Result2.ok();
    }
    return Result2.error(selectedWorkspaceResult.error);
  }
  const selectedWorkspace = selectedWorkspaceResult.value;
  if (!selectedWorkspace || selectedWorkspace.trim() === "") {
    console.log(yellow("\u26A0\uFE0F  No workspace selected"));
    return Result2.ok();
  }
  const selectedPath = selectedWorkspace.split(" (")[0];
  const workspaceIndex = config.workspaces.findIndex((workspace) => workspace.path === selectedPath);
  if (workspaceIndex === -1) {
    return Result2.error(new Error(`Workspace not found: ${selectedPath}`));
  }
  config.workspaces[workspaceIndex].active = false;
  const writeResult = await writeConfigFile(config, configFile);
  if (!writeResult.ok) {
    console.log(red("\u274C Failed to write config file: "), configFile, `(${writeResult.error.message})`);
    return Result2.error(writeResult.error);
  }
  console.log(green(`\u2705 Successfully disabled workspace: ${selectedPath}`));
  return Result2.ok();
}
async function handleSyncConfirmation(autoSync, configFile, workspaceRoot, debug, concurrency) {
  if (!autoSync) {
    const syncResult2 = await promptSyncConfirmation();
    if (!syncResult2.ok) {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
      return Result2.ok();
    }
    const shouldSync = syncResult2.value;
    if (shouldSync.toLowerCase() === "n" || shouldSync.toLowerCase() === "no") {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
      return Result2.ok();
    }
  }
  const syncResult = await syncCommand({
    config: configFile,
    workspaceRoot,
    debug,
    concurrency
  });
  if (!syncResult.ok) {
    console.log(red("\u274C Sync failed:"), syncResult.error.message);
    return Result2.error(syncResult.error);
  }
  return Result2.ok();
}
function promptWorkspaceSelection(suggestions) {
  return Result2.wrap(() => Input2.prompt({
    message: "Select workspace to disable:",
    suggestions,
    list: true,
    info: true,
    maxRows: 10
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for workspace selection", error);
  })();
}
function promptSyncConfirmation() {
  return Result2.wrap(() => Input2.prompt({
    message: "Do you want to sync now? (Y/n):",
    suggestions: [
      "Y",
      "n"
    ],
    default: "Y"
  }), (error) => new ErrorWithCause("Failed to prompt for sync confirmation", error))();
}

// cmds/enable.ts
async function enableCommand(option) {
  const configFile = option.config ?? "workspace.yml";
  const workspaceRoot = option.workspaceRoot ?? ".";
  const debug = option.debug ?? false;
  const autoSync = option.yes ?? false;
  const validated = await isDir(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const enableResult = await selectAndEnableWorkspace(config, configFile, debug);
  if (!enableResult.ok) {
    return Result2.error(enableResult.error);
  }
  const syncResult = await handleSyncConfirmation2(autoSync, configFile, workspaceRoot, debug, option.concurrency ?? 4);
  if (!syncResult.ok) {
    return Result2.error(syncResult.error);
  }
  return Result2.ok();
}
async function selectAndEnableWorkspace(config, configFile, debug) {
  const disabledWorkspaces = config.workspaces.filter((item) => !item.active);
  if (disabledWorkspaces.length === 0) {
    console.log(yellow("\u26A0\uFE0F  No disabled workspaces found"));
    return Result2.ok();
  }
  if (debug) {
    console.log(blue(`\u{1F4CA} Found ${disabledWorkspaces.length} disabled workspaces`));
  }
  const suggestions = disabledWorkspaces.map((workspace) => `${workspace.path} (${workspace.url})`);
  const selectedWorkspaceResult = await promptWorkspaceSelection2(suggestions);
  if (!selectedWorkspaceResult.ok) {
    if (selectedWorkspaceResult.error.message.includes("cancelled")) {
      console.log(yellow("\u26A0\uFE0F  Operation cancelled"));
      return Result2.ok();
    }
    return Result2.error(selectedWorkspaceResult.error);
  }
  const selectedWorkspace = selectedWorkspaceResult.value;
  if (!selectedWorkspace || selectedWorkspace.trim() === "") {
    console.log(yellow("\u26A0\uFE0F  No workspace selected"));
    return Result2.ok();
  }
  const selectedPath = selectedWorkspace.split(" (")[0];
  const workspaceIndex = config.workspaces.findIndex((workspace) => workspace.path === selectedPath);
  if (workspaceIndex === -1) {
    return Result2.error(new Error(`Workspace not found: ${selectedPath}`));
  }
  config.workspaces[workspaceIndex].active = true;
  const writeResult = await writeConfigFile(config, configFile);
  if (!writeResult.ok) {
    console.log(red("\u274C Failed to write config file: "), configFile, `(${writeResult.error.message})`);
    return Result2.error(writeResult.error);
  }
  console.log(green(`\u2705 Successfully enabled workspace: ${selectedPath}`));
  return Result2.ok();
}
async function handleSyncConfirmation2(autoSync, configFile, workspaceRoot, debug, concurrency) {
  if (!autoSync) {
    const syncResult2 = await promptSyncConfirmation2();
    if (!syncResult2.ok) {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
      return Result2.ok();
    }
    const shouldSync = syncResult2.value;
    if (shouldSync.toLowerCase() === "n" || shouldSync.toLowerCase() === "no") {
      console.log(blue("\u{1F4A1} Run 'workspace-manager sync' to apply changes"));
      return Result2.ok();
    }
  }
  const syncResult = await syncCommand({
    config: configFile,
    workspaceRoot,
    debug,
    concurrency
  });
  if (!syncResult.ok) {
    console.log(red("\u274C Sync failed:"), syncResult.error.message);
    return Result2.error(syncResult.error);
  }
  return Result2.ok();
}
function promptWorkspaceSelection2(suggestions) {
  return Result2.wrap(() => Input2.prompt({
    message: "Select workspace to enable:",
    suggestions,
    list: true,
    info: true,
    maxRows: 10
  }), (error) => {
    if (error instanceof Error && error.message.includes("cancelled")) {
      return new ErrorWithCause("Operation cancelled", error);
    }
    return new ErrorWithCause("Failed to prompt for workspace selection", error);
  })();
}
function promptSyncConfirmation2() {
  return Result2.wrap(() => Input2.prompt({
    message: "Do you want to sync now? (Y/n):",
    suggestions: [
      "Y",
      "n"
    ],
    default: "Y"
  }), (error) => new ErrorWithCause("Failed to prompt for sync confirmation", error))();
}

// cmds/save.ts
async function saveCommand(option) {
  const configFile = option.config ?? "workspace.yml";
  const workspaceRoot = option.workspaceRoot ?? ".";
  const debug = option.debug ?? false;
  const validated = await isDir(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  if (debug) {
    console.log(blue("\u{1F50D} Scanning active workspaces for current branches..."));
  }
  const activeWorkspaces = config.workspaces.filter((item) => item.active);
  if (activeWorkspaces.length === 0) {
    console.log(yellow("\u26A0\uFE0F  No active workspaces found"));
    return Result2.ok();
  }
  let updatedCount = 0;
  let errorCount = 0;
  for (const workspace of activeWorkspaces) {
    const workspacePath = join6(workspaceRoot, workspace.path);
    const dirExists = await isDir(workspacePath);
    if (!dirExists.ok) {
      console.log(yellow(`\u26A0\uFE0F  Workspace directory not found: ${workspace.path}`));
      errorCount++;
      continue;
    }
    const isRepo = await gitIsRepository(workspacePath);
    if (!isRepo.ok || !isRepo.value) {
      console.log(yellow(`\u26A0\uFE0F  Not a git repository: ${workspace.path}`));
      errorCount++;
      continue;
    }
    const currentBranch = await gitGetCurrentBranch(workspacePath);
    if (!currentBranch.ok) {
      console.log(red(`\u274C Failed to get current branch for ${workspace.path}: ${currentBranch.error.message}`));
      errorCount++;
      continue;
    }
    const newBranch = currentBranch.value;
    if (workspace.branch !== newBranch) {
      if (debug) {
        console.log(blue(`\u{1F4DD} Updating ${workspace.path}: ${workspace.branch} \u2192 ${newBranch}`));
      }
      workspace.branch = newBranch;
      updatedCount++;
    } else {
      if (debug) {
        console.log(blue(`\u2713 ${workspace.path}: ${workspace.branch} (no change)`));
      }
    }
  }
  if (updatedCount > 0) {
    const writeResult = await writeConfigFile(config, configFile);
    if (!writeResult.ok) {
      console.log(red("\u274C Failed to write config file: "), configFile, `(${writeResult.error.message})`);
      return Result2.error(writeResult.error);
    }
    console.log(green(`\u2705 Successfully updated ${updatedCount} workspace(s) in ${configFile}`));
  } else {
    console.log(green("\u2705 All workspaces are already up to date"));
  }
  if (errorCount > 0) {
    console.log(yellow(`\u26A0\uFE0F  ${errorCount} workspace(s) had errors and were skipped`));
  }
  console.log(green("\u{1F389} Save operation completed successfully!"));
  return Result2.ok();
}

// cmds/status.ts
async function statusCommand(option) {
  const configFile = option.config ??= "workspace.yml";
  const workspaceRoot = option.workspaceRoot ??= ".";
  const debug = option.debug ?? false;
  const concurrency = option.concurrency ?? 4;
  const json = option.json ?? false;
  const verbose = option.verbose ?? false;
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    if (!json) {
      console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    } else {
      console.log(JSON.stringify({
        error: parseConfig2.error.message
      }, null, 2));
    }
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const activeWorkspaces = config.workspaces.filter((item) => item.active);
  if (activeWorkspaces.length === 0) {
    if (!json) {
      console.log(yellow("\u26A0\uFE0F  No active repositories found in workspace configuration"));
    } else {
      console.log(JSON.stringify({
        repositories: [],
        summary: {
          total: 0
        }
      }, null, 2));
    }
    return Result2.ok();
  }
  if (debug) {
    console.log(blue(`\u{1F50D} Checking status for ${activeWorkspaces.length} active repositories...`));
  }
  const statusResults = await processConcurrentlyWithResults(activeWorkspaces, async (workspace) => {
    const workspacePath = join6(workspaceRoot, workspace.path);
    const status = {
      path: workspace.path,
      url: workspace.url,
      trackingBranch: workspace.branch,
      isGoModule: workspace.isGolang,
      active: workspace.active,
      exists: false
    };
    try {
      const dir = await isDir(workspacePath);
      if (!dir.ok) {
        status.error = "Directory does not exist";
        return Result2.ok(status);
      }
      const isRepo = await gitIsRepository(workspacePath);
      if (!isRepo.ok) {
        status.error = "Failed to check git repository";
        return Result2.ok(status);
      }
      if (!isRepo.value) {
        status.error = "Not a git repository";
        return Result2.ok(status);
      }
      status.exists = true;
      const currentBranch = await gitGetCurrentBranch(workspacePath);
      if (!currentBranch.ok) {
        status.error = "Failed to get current branch";
        return Result2.ok(status);
      }
      status.currentBranch = currentBranch.value;
      const isClean = await gitIsWorkingDirectoryClean(workspacePath);
      if (!isClean.ok) {
        status.error = "Failed to check working directory";
        return Result2.ok(status);
      }
      status.isClean = isClean.value;
      if (!isClean.value || verbose) {
        const fileStatus = await getFileStatus(workspacePath);
        if (fileStatus.ok) {
          status.modifiedFiles = fileStatus.value.modified;
          status.untrackedFiles = fileStatus.value.untracked;
        }
      }
      return Result2.ok(status);
    } catch (error) {
      status.error = error instanceof Error ? error.message : "Unknown error";
      return Result2.ok(status);
    }
  }, concurrency);
  const repositories = statusResults.map((result) => result.ok ? result.value : {
    path: "",
    url: "",
    trackingBranch: "",
    isGoModule: false,
    active: false,
    exists: false,
    error: result.error?.message || "Unknown error"
  });
  if (json) {
    outputJson(repositories);
  } else {
    outputTable(repositories, verbose);
  }
  return Result2.ok();
}
async function getFileStatus(cwd) {
  return await Result2.fromAsyncCatching(async () => {
    const result = await new Deno.Command("git", {
      args: [
        "status",
        "--porcelain"
      ],
      cwd,
      stderr: "null"
    }).output();
    const output = new TextDecoder().decode(result.stdout).trim();
    const lines = output.split("\n").filter((line) => line.length > 0);
    let modified = 0;
    let untracked = 0;
    for (const line of lines) {
      const status = line.substring(0, 2);
      if (status === "??") {
        untracked++;
      } else if (status.includes("M") || status.includes("D") || status.includes("A")) {
        modified++;
      }
    }
    return {
      modified,
      untracked
    };
  }).mapError((error) => new ErrorWithCause("Failed to get file status", error));
}
function outputJson(repositories) {
  const summary = {
    total: repositories.length,
    clean: repositories.filter((r) => r.exists && r.isClean).length,
    modified: repositories.filter((r) => r.exists && !r.isClean).length,
    missing: repositories.filter((r) => !r.exists).length,
    onWrongBranch: repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch).length,
    goModules: repositories.filter((r) => r.isGoModule).length
  };
  const output = {
    summary,
    repositories: repositories.map((repo) => {
      const repoData = {
        path: repo.path,
        url: repo.url,
        trackingBranch: repo.trackingBranch,
        isGoModule: repo.isGoModule,
        exists: repo.exists,
        currentBranch: repo.currentBranch,
        isClean: repo.isClean,
        onCorrectBranch: repo.exists ? repo.currentBranch === repo.trackingBranch : true
      };
      if (repo.modifiedFiles !== void 0) {
        repoData.modifiedFiles = repo.modifiedFiles;
      }
      if (repo.untrackedFiles !== void 0) {
        repoData.untrackedFiles = repo.untrackedFiles;
      }
      if (repo.error) {
        repoData.error = repo.error;
      }
      return repoData;
    })
  };
  console.log(JSON.stringify(output, null, 2));
}
function outputTable(repositories, _verbose) {
  if (repositories.length === 0) {
    console.log(yellow("\u26A0\uFE0F  No active repositories found"));
    return;
  }
  const clean = repositories.filter((r) => r.exists && r.isClean).length;
  const modified = repositories.filter((r) => r.exists && !r.isClean).length;
  const missing = repositories.filter((r) => !r.exists).length;
  const wrongBranch = repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch).length;
  const goModules = repositories.filter((r) => r.isGoModule).length;
  console.log("");
  console.log(blue(`\u{1F4CA} Workspace Status - ${repositories.length} active repositories`));
  console.log("");
  const cleanRepos = repositories.filter((r) => r.exists && r.isClean && r.currentBranch === r.trackingBranch);
  const dirtyRepos = repositories.filter((r) => r.exists && !r.isClean);
  const wrongBranchRepos = repositories.filter((r) => r.exists && r.currentBranch && r.trackingBranch && r.currentBranch !== r.trackingBranch);
  const missingRepos = repositories.filter((r) => !r.exists);
  if (cleanRepos.length > 0) {
    console.log(green(`\u2705 Clean Repositories (${cleanRepos.length})`));
    console.log("\u2500".repeat(80));
    for (const repo of cleanRepos) {
      const branchInfo = repo.currentBranch === repo.trackingBranch ? green(repo.currentBranch) : yellow(`${repo.currentBranch} \u2192 ${repo.trackingBranch}`);
      const goIndicator = repo.isGoModule ? "\u{1F439}" : "  ";
      const pathStr = (repo.path || "").padEnd(35);
      const branchStr = branchInfo.padEnd(20);
      console.log(`  ${goIndicator} ${pathStr} ${branchStr} \u2705 clean`);
    }
    console.log("");
  }
  if (dirtyRepos.length > 0) {
    console.log(yellow(`\u26A0\uFE0F  Modified Repositories (${dirtyRepos.length})`));
    console.log("\u2500".repeat(80));
    for (const repo of dirtyRepos) {
      const branchInfo = repo.currentBranch === repo.trackingBranch ? green(repo.currentBranch) : yellow(`${repo.currentBranch} \u2192 ${repo.trackingBranch}`);
      const goIndicator = repo.isGoModule ? "\u{1F439}" : "  ";
      const pathStr = (repo.path || "").padEnd(35);
      const branchStr = branchInfo.padEnd(20);
      const changes = [];
      if (repo.modifiedFiles && repo.modifiedFiles > 0) changes.push(`${repo.modifiedFiles}M`);
      if (repo.untrackedFiles && repo.untrackedFiles > 0) changes.push(`${repo.untrackedFiles}U`);
      const changesStr = changes.length > 0 ? changes.join(" ") : "dirty";
      console.log(`  ${goIndicator} ${pathStr} ${branchStr} \u26A0\uFE0F  ${changesStr}`);
    }
    console.log("");
  }
  if (wrongBranchRepos.length > 0) {
    console.log(yellow(`\u{1F33F} Wrong Branch (${wrongBranchRepos.length})`));
    console.log("\u2500".repeat(80));
    for (const repo of wrongBranchRepos) {
      if (repo.isClean === false) continue;
      const branchInfo = yellow(`${repo.currentBranch} \u2192 ${repo.trackingBranch}`);
      const goIndicator = repo.isGoModule ? "\u{1F439}" : "  ";
      const pathStr = (repo.path || "").padEnd(35);
      const branchStr = branchInfo.padEnd(20);
      console.log(`  ${goIndicator} ${pathStr} ${branchStr} \u{1F33F} wrong branch`);
    }
    console.log("");
  }
  if (missingRepos.length > 0) {
    console.log(red(`\u274C Missing Repositories (${missingRepos.length})`));
    console.log("\u2500".repeat(80));
    for (const repo of missingRepos) {
      const goIndicator = repo.isGoModule ? "\u{1F439}" : "  ";
      const pathStr = (repo.path || "").padEnd(35);
      const trackingStr = gray(repo.trackingBranch || "unknown").padEnd(20);
      const errorStr = red(repo.error || "missing");
      console.log(`  ${goIndicator} ${pathStr} ${trackingStr} \u274C ${errorStr}`);
    }
    console.log("");
  }
  console.log(gray("SUMMARY"));
  const summaryParts = [];
  if (clean > 0) summaryParts.push(green(`\u2705 ${clean} clean`));
  if (modified > 0) summaryParts.push(yellow(`\u26A0\uFE0F  ${modified} modified`));
  if (wrongBranch > 0) summaryParts.push(yellow(`\u{1F33F} ${wrongBranch} wrong branch`));
  if (missing > 0) summaryParts.push(red(`\u274C ${missing} missing`));
  if (goModules > 0) summaryParts.push(`\u{1F439} ${goModules} Go modules`);
  console.log(summaryParts.join("  "));
  console.log("");
}

// cmds/update.ts
async function updateCommand(option) {
  const configFile = option.config ??= "workspace.yml";
  const workspaceRoot = option.workspaceRoot ??= ".";
  const debug = option.debug ?? false;
  const concurrency = option.concurrency ?? 4;
  const validated = await validateWorkspaceDir2(workspaceRoot);
  if (!validated.ok) {
    console.log(red("\u274C Invalid workspace directory: "), workspaceRoot, `(${validated.error.message})`);
    return Result2.error(validated.error);
  }
  const parseConfig2 = await parseConfigFile(configFile);
  if (!parseConfig2.ok) {
    console.log(red("\u274C Failed to parse config file: "), configFile, `(${parseConfig2.error.message})`);
    return Result2.error(parseConfig2.error);
  }
  const config = parseConfig2.value;
  const activeWorkspaces = config.workspaces.filter((item) => item.active);
  if (debug) {
    console.log(blue(`\u{1F4CA} Found ${activeWorkspaces.length} active workspaces to update`));
  }
  const updateResult = await processConcurrently(activeWorkspaces, async (workspace) => {
    const workspacePath = join6(workspaceRoot, workspace.path);
    const dir = await isDir(workspacePath);
    if (!dir.ok) {
      console.log(yellow(`\u26A0\uFE0F  Workspace directory does not exist, skipping: ${workspace.path}`));
      return Result2.ok();
    }
    console.log(blue(`\u{1F504} Updating workspace: ${workspace.path} (branch: ${workspace.branch})`));
    const checkoutResult = await gitCheckoutBranch(workspace.branch, workspacePath);
    if (!checkoutResult.ok) {
      console.log(red(`\u274C Failed to checkout to branch ${workspace.branch} in ${workspace.path}`), `(${checkoutResult.error.message})`);
      return Result2.error(checkoutResult.error);
    }
    if (debug) {
      console.log(green(`\u2713 Checked out to branch ${workspace.branch} in ${workspace.path}`));
    }
    const isCleanResult = await gitIsWorkingDirectoryClean(workspacePath);
    if (!isCleanResult.ok) {
      console.log(red(`\u274C Failed to check working directory status in ${workspace.path}`), `(${isCleanResult.error.message})`);
      return Result2.error(isCleanResult.error);
    }
    const isClean = isCleanResult.value;
    let hasStashedChanges = false;
    if (!isClean) {
      console.log(yellow(`\u{1F4BE} Working directory is dirty in ${workspace.path}, stashing changes...`));
      const stashResult = await gitStash(workspacePath, `workspace-manager auto-stash before update`);
      if (!stashResult.ok) {
        console.log(red(`\u274C Failed to stash changes in ${workspace.path}`), `(${stashResult.error.message})`);
        return Result2.error(stashResult.error);
      }
      hasStashedChanges = true;
      if (debug) {
        console.log(green(`\u2713 Stashed changes in ${workspace.path}`));
      }
    }
    const fetchResult = await gitFetch(workspacePath);
    if (!fetchResult.ok) {
      console.log(red(`\u274C Failed to fetch latest changes from origin in ${workspace.path}`), `(${fetchResult.error.message})`);
      return Result2.error(fetchResult.error);
    }
    if (debug) {
      console.log(green(`\u2713 Fetched latest changes from origin in ${workspace.path}`));
    }
    const pullResult = await gitPullOriginBranch(workspace.branch, workspacePath);
    if (!pullResult.ok) {
      console.log(red(`\u274C Failed to pull latest changes from origin/${workspace.branch} in ${workspace.path}`), `(${pullResult.error.message})`);
      return Result2.error(pullResult.error);
    }
    if (debug) {
      console.log(green(`\u2713 Pulled latest changes from origin/${workspace.branch} in ${workspace.path}`));
    }
    if (hasStashedChanges) {
      console.log(blue(`\u{1F504} Restoring stashed changes in ${workspace.path}...`));
      const popResult = await gitStashPop(workspacePath);
      if (!popResult.ok) {
        console.log(yellow(`\u26A0\uFE0F  Warning: Failed to pop stash in ${workspace.path}. You may need to manually resolve conflicts.`), `(${popResult.error.message})`);
        console.log(yellow(`\u{1F4A1} You can manually run 'git stash pop' in ${workspace.path} to restore your changes.`));
      } else {
        if (debug) {
          console.log(green(`\u2713 Restored stashed changes in ${workspace.path}`));
        }
      }
    }
    console.log(green(`\u2705 Successfully updated workspace: ${workspace.path}`));
    return Result2.ok();
  }, concurrency);
  if (!updateResult.ok) {
    return updateResult;
  }
  console.log(green(`\u{1F389} All workspaces updated successfully!`));
  return Result2.ok();
}
async function validateWorkspaceDir2(path) {
  const stat2 = await Result2.fromAsyncCatching(() => Deno.stat(path));
  if (!stat2.ok) {
    return Result2.error(new ErrorWithCause(`Workspace directory is not a directory`, stat2.error));
  }
  if (!stat2.value.isDirectory) {
    return Result2.error(new Error(`Workspace directory is not a directory`));
  }
  return Result2.ok();
}

// main.ts
var VERSION = "0.0.1-rc10";
var cli = new Command().name("workspace-manager").version(VERSION).description("Workspace manager for 7solutions");
cli.command("sync", "Sync workspace with remote").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).option("-y, --yes", "Accept all changes").action(async (options) => {
  const result = await syncCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency
  });
  if (!result.ok) {
    console.log(red("\u274C Sync failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("update", "Update all submodules by checking out to tracking branches and pulling latest changes").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).action(async (options) => {
  const result = await updateCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency
  });
  if (!result.ok) {
    console.log(red("\u274C Update failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("enable", "Enable a disabled workspace repository").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).option("-y, --yes", "Skip sync confirmation prompt").action(async (options) => {
  const result = await enableCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency,
    yes: options.yes
  });
  if (!result.ok) {
    console.log(red("\u274C Enable failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("disable", "Disable an active workspace repository").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).option("-y, --yes", "Skip sync confirmation prompt").action(async (options) => {
  const result = await disableCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency,
    yes: options.yes
  });
  if (!result.ok) {
    console.log(red("\u274C Disable failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("save", "Save current workspace state by updating workspace.yml with current tracking branches").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).action(async (options) => {
  const result = await saveCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug
  });
  if (!result.ok) {
    console.log(red("\u274C Save failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("add [repo] [path]", "Add a new repository to the workspace configuration").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).option("-b, --branch <branch:string>", "Git branch to checkout", {
  default: "main"
}).option("--go", "Mark as Go module for go.work integration", {
  default: false
}).option("--sync", "Sync workspace after adding repository", {
  default: false
}).option("-y, --yes", "Skip interactive prompts and use non-interactive mode", {
  default: false
}).action(async (options, repo, path) => {
  const result = await addCommand({
    repo,
    path,
    branch: options.branch,
    go: options.go,
    sync: options.sync,
    yes: options.yes,
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency
  });
  if (!result.ok) {
    console.log(red("\u274C Add failed:"), result.error.message);
    Deno.exit(1);
  }
});
cli.command("status", "Show current workspace status").alias("s").option("-c, --config <config:string>", "Workspace config file", {
  default: "workspace.yml"
}).option("-w, --workspace-root <workspace-root:string>", "Workspace root", {
  default: "."
}).option("-d, --debug", "Enable debug mode", {
  default: false
}).option("-j, --concurrency <concurrency:number>", "Number of concurrent operations", {
  default: 4
}).option("--json", "Output in JSON format", {
  default: false
}).option("-v, --verbose", "Show verbose git information", {
  default: false
}).action(async (options) => {
  const result = await statusCommand({
    config: options.config,
    workspaceRoot: options.workspaceRoot,
    debug: options.debug,
    concurrency: options.concurrency,
    json: options.json,
    verbose: options.verbose
  });
  if (!result.ok) {
    console.log(red("\u274C Status failed:"), result.error.message);
    Deno.exit(1);
  }
});
if (import.meta.main) {
  const result = await Result2.fromAsyncCatching(() => cli.parse(Deno.args));
  if (!result.ok) {
    console.log(red("\u274C CLI Error:"), result.error.message);
    Deno.exit(1);
  }
}
