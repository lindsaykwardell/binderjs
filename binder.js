class Binder {
  data = {};
  computed = {};
  watch = {};

  constructor(
    target = "#app",
    initValues = {
      template: null,
      data: {},
      computed: {},
      methods: {},
      watch: {},
      onStart: async () => null
    }
  ) {
    const values = {
      data: {},
      computed: {},
      methods: {},
      watch: {},
      onStart: async () => null,
      ...initValues,
      template: initValues.template
        ? initValues.template
        : document.querySelector(target).innerHTML
    };

    const data = {};
    data.root = document.querySelector(target);
    data.template = values.template;
    data.root.innerHTML = "<div></div>";
    data.loops = [];
    Object.keys(values.data).forEach(key => {
      data[`_${key}`] = values.data[key];
      Object.defineProperty(this, key, {
        get() {
          return this.data[`_${key}`];
        },
        set(val) {
          this.data[`_${key}`] = val;
          this.render(key);
        }
      });
    });

    const computedKeys = Object.keys(values.computed);
    const computed = {};
    computedKeys.forEach(key => {
      data[`_${key}`] = values.computed[key].bind(this);
      Object.defineProperty(this, key, {
        get() {
          return this.data[`_${key}`]();
        }
      });
      computed[key] = {
        prev: undefined
      };
    });

    Object.keys(values.methods).forEach(key => {
      this[key] = values.methods[key].bind(this);
      window[key] = (...args) => this[key](...args);
    });

    const watch = {};

    Object.keys(values.watch).forEach(key => {
      watch[key] = values.watch[key].bind(this);
    });

    this.data = data;
    this.computed = computed;
    this.watch = watch;

    this.start().then(() => values.onStart.bind(this)());
  }

  getVal = (key, source = this) => {
    try {
      if (typeof key === "string" && key.includes('"'))
        return key.replace(/^\"+|\"+$/g, "");
      const keys = key.split(".");
      let returnVal = undefined;
      keys.forEach(elemKey => {
        if (elemKey.includes("[")) {
          let keyBits = elemKey.split("[");
          keyBits[1] = keyBits[1].replace("[", "").replace("]", "");
          if (returnVal) {
            returnVal = returnVal[keyBits[0]][keyBits[1]];
          } else returnVal = source[keyBits[0]][keyBits[1]];
        } else {
          if (returnVal) returnVal = returnVal[elemKey];
          else returnVal = source[elemKey];
        }
      });
      if (returnVal) return returnVal;
      else return "";
    } catch (e) {
      return "";
    }
  };

  valExists = (key, source = this) => {
    if (typeof key === "string" && key.includes('"'))
      return key.replace(/^\"+|\"+$/g, "");
    const keys = key.split(".");
    let returnVal = undefined;
    let exists = true;
    keys.forEach(elemKey => {
      if (exists) {
        if (elemKey.includes("[")) {
          let keyBits = elemKey.split("[");
          keyBits[1] = keyBits[1].replace("[", "").replace("]", "");
          if (returnVal) {
            exists =
              returnVal.hasOwnProperty(keyBits[0]) &&
              returnVal.hasOwnProperty(keyBits[0][keyBits[1]]);
            if (exists) returnVal = returnVal[keyBits[0]][keyBits[1]];
          } else {
            exists =
              source.hasOwnProperty(keyBits[0]) &&
              source.hasOwnProperty(keyBits[0][keyBits[1]]);
            if (exists) returnVal = source[keyBits[0]][keyBits[1]];
          }
        } else {
          if (returnVal) {
            exists = returnVal.hasOwnProperty(elemKey);
            if (exists) returnVal = returnVal[elemKey];
          } else {
            exists = source.hasOwnProperty(elemKey);
            returnVal = source[elemKey];
          }
        }
      }
    });
    return exists;
  };

  start = async () => {
    let text = this.data.template;

    const matches = text.match(/{{.[A-Z, a-z, 0-9, ._\[\]\(\)\"]*.}}/g);
    if (matches)
      matches.forEach(match => {
        let key = match
          .replace("{{", "")
          .replace("}}", "")
          .trim();

        let val;
        if (key.includes("(")) {
          const func = key.split("(")[0];
          const args = key
            .split("(")[1]
            .replace(")", "")
            .split(",");
          const result = this[func]
            ? this[func](...args.map(arg => this.getVal(arg)))
            : "";
          val = `<span data-method="${key}">${result}</span>`;
        } else {
          val = `<span data-val="${key}">${this.getVal(key)}</span>`;
        }
        text = text.replace(match, val);
      });
    this.data.root.innerHTML = text;
    const loops = this.data.root.querySelectorAll("[data-for]");

    loops.forEach((loop, index) => {
      loop.setAttribute("data-loop", index);
    });
    loops.forEach(loop => {
      const node = loop.cloneNode(true);
      node.removeAttribute("data-for");
      this.data.loops.push(node);
    });
    loops.forEach(loop => {
      this.renderLoop(
        loop,
        loop.getAttribute("data-for"),
        loop.getAttribute("data-loop")
      );
    });
    const bounds = this.data.root.querySelectorAll("[data-bind]");
    bounds.forEach(elem => {
      elem.value = this.getVal(elem.getAttribute("data-bind"));
      elem.addEventListener("input", e => {
        this[elem.getAttribute("data-bind")] = e.target.value;
      });
    });

    this.recompute();
  };

  render = (key, elem = this.data.root, source = this) => {
    const mounts = elem.querySelectorAll(`[data-val='${key}']`);
    mounts.forEach(elem => {
      let val = elem.getAttribute("data-val");
      elem.innerHTML = this.getVal(val, source);
    });
    const bounds = elem.querySelectorAll(`[data-bind='${key}']`);
    bounds.forEach(elem => {
      elem.value = this.getVal(elem.getAttribute("data-bind"), source);
    });
    const loops = elem.querySelectorAll(`[data-for='${key}']`);
    loops.forEach(loop => {
      this.renderLoop(
        loop,
        loop.getAttribute("data-for"),
        loop.getAttribute("data-loop"),
        source
      );
    });
    if (this.watch[key]) this.watch[key]();
    this.recompute(elem, source);
  };

  renderLoop = (node, val, index, source = this) => {
    const loopBits = val.split(" in ");
    const data = this.getVal(loopBits[1], source);
    if (Array.isArray(data)) {
      node.innerHTML = "";
      data.forEach(elem => {
        const loopElem = {};
        loopElem[loopBits[0]] = elem;
        let childNode = this.data.loops[index].cloneNode(true);
        const dataMatches = childNode.querySelectorAll("[data-val]");
        dataMatches.forEach(match => {
          this.render(match.getAttribute("data-val"), childNode, loopElem);
        });
        const loopMatches = childNode.querySelectorAll("[data-for]");
        loopMatches.forEach(loop => {
          this.renderLoop(
            loop,
            loop.getAttribute("data-for"),
            loop.getAttribute("data-loop"),
            loopElem
          );
        });
        this.recompute(childNode, loopElem);
        node.appendChild(childNode);
      });
    }
  };

  recompute = (elem = this.data.root, source = this) => {
    const keys = Object.keys(this.computed);

    keys.forEach(key => {
      if (this.computed[key].prev !== this[key]) {
        this.computed[key].prev = this[key];
        this.render(key);
      }
    });

    const nodes = elem.querySelectorAll("[data-method]");
    nodes.forEach(node => {
      const func = node.getAttribute("data-method").split("(")[0];
      const args = node
        .getAttribute("data-method")
        .split("(")[1]
        .replace(")", "")
        .split(",");
      try {
        let proceed = true;
        args.forEach(arg => {
          if (!this.valExists(arg, source)) proceed = false;
        });
        if (proceed) {
          const result = this[func]
            ? this[func](...args.map(arg => this.getVal(arg, source)))
            : "";
          if (result !== node.innerHTML) {
            node.innerHTML = result;
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
  };
}
