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
      template: initValues.template ? initValues.template : document.querySelector(target).innerHTML
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
          val = `<span data-val="${key}" class="__${
            key.split(".")[0].split("[")[0]
          }-bind">${this.getVal(key)}</span>`;
        }
        text = text.replace(match, val);
      });
    this.data.root.innerHTML = text;
    const loops = this.data.root.querySelectorAll("[data-for]");
    loops.forEach(loop => {
      const node = loop.children[0];
      const len = this.data.loops.push(node);
      loop.setAttribute("data-loop", len - 1);
      this.renderLoop(
        loop,
        this.getVal(loop.getAttribute("data-for")),
        len - 1
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
    const mounts = elem.querySelectorAll(`.__${key}-bind`);
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
        this.getVal(loop.getAttribute("data-for")),
        loop.getAttribute("data-loop")
      );
    });
    if (this.watch[key]) this.watch[key]();
    this.recompute();
  };

  renderLoop = (node, val, index) => {
    if (Array.isArray(val)) {
      node.innerHTML = "";
      val.forEach(elem => {
        let childNode = this.data.loops[index].cloneNode(true);
        const matches = childNode.querySelectorAll("[data-val]");
        matches.forEach(match => {
          this.render(match.getAttribute("data-val"), childNode, elem);
        });
        node.appendChild(childNode);
      });
    }
  };

  recompute = () => {
    const keys = Object.keys(this.computed);

    keys.forEach(key => {
      if (this.computed[key].prev !== this[key]) {
        this.computed[key].prev = this[key];
        this.render(key);
      }
    });

    const nodes = this.data.root.querySelectorAll("[data-method]");
    nodes.forEach(node => {
      const func = node.getAttribute("data-method").split("(")[0];
      const args = node
        .getAttribute("data-method")
        .split("(")[1]
        .replace(")", "")
        .split(",");
      const result = this[func]
        ? this[func](...args.map(arg => this.getVal(arg)))
        : "";
      if (result !== node.innerHTML) {
        node.innerHTML = result;
      }
    });
  };
}
