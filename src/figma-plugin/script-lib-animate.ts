import { ScriptEnv, scriptenv } from "./scriptenv"

type SAnimate = scriptenv.SAnimate
type SAnimation = scriptenv.SAnimation
type SAnimationCallback = scriptenv.SAnimationCallback
type SAnimationTimingFunction = scriptenv.SAnimationTimingFunction


const pow = Math.pow
const sqrt = Math.sqrt
const sin = Math.sin
const cos = Math.cos
const PI = Math.PI
const c1 = 1.70158
const c2 = c1 * 1.525
const c3 = c1 + 1
const c4 = (2 * PI) / 3
const c5 = (2 * PI) / 4.5

function easeOutBounce(x :number): number {
  const n1 = 7.5625
  const d1 = 2.75

  if (x < 1 / d1) {
    return n1 * x * x
  } else if (x < 2 / d1) {
    return n1 * (x -= 1.5 / d1) * x + 0.75
  } else if (x < 2.5 / d1) {
    return n1 * (x -= 2.25 / d1) * x + 0.9375
  } else {
    return n1 * (x -= 2.625 / d1) * x + 0.984375
  }
}

const easingsFunctions :any = {
  easeInQuad(x :number) {
    return x * x
  },
  easeOutQuad(x :number) {
    return 1 - (1 - x) * (1 - x)
  },
  easeInOutQuad(x :number) {
    return x < 0.5 ? 2 * x * x : 1 - pow(-2 * x + 2, 2) / 2
  },
  easeInCubic(x :number) {
    return x * x * x
  },
  easeOutCubic(x :number) {
    return 1 - pow(1 - x, 3)
  },
  easeInOutCubic(x :number) {
    return x < 0.5 ? 4 * x * x * x : 1 - pow(-2 * x + 2, 3) / 2
  },
  easeInQuart(x :number) {
    return x * x * x * x
  },
  easeOutQuart(x :number) {
    return 1 - pow(1 - x, 4)
  },
  easeInOutQuart(x :number) {
    return x < 0.5 ? 8 * x * x * x * x : 1 - pow(-2 * x + 2, 4) / 2
  },
  easeInQuint(x :number) {
    return x * x * x * x * x
  },
  easeOutQuint(x :number) {
    return 1 - pow(1 - x, 5)
  },
  easeInOutQuint(x :number) {
    return x < 0.5 ? 16 * x * x * x * x * x : 1 - pow(-2 * x + 2, 5) / 2
  },
  easeInSine(x :number) {
    return 1 - cos((x * PI) / 2)
  },
  easeOutSine(x :number) {
    return sin((x * PI) / 2)
  },
  easeInOutSine(x :number) {
    return -(cos(PI * x) - 1) / 2
  },
  easeInExpo(x :number) {
    return x === 0 ? 0 : pow(2, 10 * x - 10)
  },
  easeOutExpo(x :number) {
    return x === 1 ? 1 : 1 - pow(2, -10 * x)
  },
  easeInOutExpo(x :number) {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : x < 0.5
      ? pow(2, 20 * x - 10) / 2
      : (2 - pow(2, -20 * x + 10)) / 2
  },
  easeInCirc(x :number) {
    return 1 - sqrt(1 - pow(x, 2))
  },
  easeOutCirc(x :number) {
    return sqrt(1 - pow(x - 1, 2))
  },
  easeInOutCirc(x :number) {
    return x < 0.5
      ? (1 - sqrt(1 - pow(2 * x, 2))) / 2
      : (sqrt(1 - pow(-2 * x + 2, 2)) + 1) / 2
  },
  easeInBack(x :number) {
    return c3 * x * x * x - c1 * x * x
  },
  easeOutBack(x :number) {
    return 1 + c3 * pow(x - 1, 3) + c1 * pow(x - 1, 2)
  },
  easeInOutBack(x :number) {
    return x < 0.5
      ? (pow(2 * x, 2) * ((c2 + 1) * 2 * x - c2)) / 2
      : (pow(2 * x - 2, 2) * ((c2 + 1) * (x * 2 - 2) + c2) + 2) / 2
  },
  easeInElastic(x :number) {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : -pow(2, 10 * x - 10) * sin((x * 10 - 10.75) * c4)
  },
  easeOutElastic(x :number) {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : pow(2, -10 * x) * sin((x * 10 - 0.75) * c4) + 1
  },
  easeInOutElastic(x :number) {
    return x === 0
      ? 0
      : x === 1
      ? 1
      : x < 0.5
      ? -(pow(2, 20 * x - 10) * sin((20 * x - 11.125) * c5)) / 2
      : (pow(2, -20 * x + 10) * sin((20 * x - 11.125) * c5)) / 2 + 1
  },
  easeInBounce(x :number) {
    return 1 - easeOutBounce(1 - x)
  },
  easeOutBounce,
  easeInOutBounce(x :number) {
    return x < 0.5
      ? (1 - easeOutBounce(1 - 2 * x)) / 2
      : (1 + easeOutBounce(2 * x - 1)) / 2
  },
}

// aliases
easingsFunctions.easeIn    = easingsFunctions.easeInQuad
easingsFunctions.easeOut   = easingsFunctions.easeOutQuad
easingsFunctions.easeInOut = easingsFunctions.easeInOutQuad


export function initAnimateAPI(animate :SAnimate) {
  // Note: The animate() function passed in here is defined in scripter-env.js for convenient
  // access to timing functions. This code here adds properties that are script-agnostic to that
  // function.

  for (let k in easingsFunctions) {
    animate[k] = easingsFunctions[k]
  }

  // transition(duration :number, tf :TimingFunction|null, f :SAnimationCallback) :SAnimation
  // transition(duration :number, f :SAnimationCallback) :SAnimation
  animate.transition = (
    duration :number,
    f1 :SAnimationTimingFunction | null | SAnimationCallback,
    f2? :SAnimationCallback,
  ) :SAnimation => {
    let timingFun = easingsFunctions.easeInOut
    let userFun :SAnimationCallback
    if (f2) {
      if (f1) {
        timingFun = f1 as SAnimationTimingFunction
      }
      userFun = f2 as SAnimationCallback
    } else {
      userFun = f1 as SAnimationCallback
    }
    duration = Math.max(0, duration) // make sure no negative durations are provided
    return animate(time => {
      const t = Math.min(1, time / duration) // t is normalized time
      const p = t >= 1 ? 1 : timingFun(t) // p is normalized progress
      const r = userFun(p)
      return p == 1.0 ? "STOP" : r
    })
  }
}


export function createAnimateAPI(env :ScriptEnv, _ign_scriptId :string) :SAnimate {
  // Called for every script invocation.
  // We must not modify env.animate.
  // We could return a new SAnimate function here if we need to do invocation-specific
  // handling like resource management.
  return env.animate
}
