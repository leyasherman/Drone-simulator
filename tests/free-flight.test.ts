import { describe, expect, it } from 'vitest';
import { FreeFlight } from '../src/game/free-flight';
import { InputManager } from '../src/input/input';
import { FREESTYLE_5 } from '../src/sim/profiles';

function setup() {
  const input = new InputManager(() => null);
  return { input, flight: new FreeFlight(FREESTYLE_5, input) };
}

/** Runs `seconds` of game time at 60 fps. */
function fly(flight: FreeFlight, seconds: number): void {
  for (let i = 0; i < Math.round(seconds * 60); i++) flight.frame(1 / 60);
}

function arm(input: InputManager, flight: FreeFlight): void {
  input.keyboard.keyDown('Space');
  fly(flight, 1 / 60);
  input.keyboard.keyUp('Space');
}

describe('FreeFlight', () => {
  it('starts disarmed, resting on the pad', () => {
    const { flight } = setup();
    fly(flight, 1);
    expect(flight.drone.armed).toBe(false);
    expect(flight.altitude).toBeLessThan(0.01);
    expect(flight.contact.touching).toBe(true);
  });

  it('refuses to arm with throttle up', () => {
    const { input, flight } = setup();
    input.keyboard.setThrottle(0.5);
    input.keyboard.keyDown('Space');
    const e = flight.frame(1 / 60);
    expect(e.armBlocked).toBe(true);
    expect(flight.drone.armed).toBe(false);
  });

  it('takes off, climbs, then lands and settles', () => {
    const { input, flight } = setup();
    arm(input, flight);
    expect(flight.drone.armed).toBe(true);

    input.keyboard.setThrottle(0.55);
    fly(flight, 2);
    expect(flight.altitude).toBeGreaterThan(3);

    input.keyboard.setThrottle(0.3); // below hover: sink
    fly(flight, 6);
    expect(flight.contact.touching).toBe(true);
    expect(flight.drone.body.velocity.length()).toBeLessThan(0.1);
    const up = flight.drone.body.orientation;
    expect(Math.abs(up.x) + Math.abs(up.z)).toBeLessThan(0.01); // still level
  });

  it('respawn puts the drone back on the pad, disarmed, with throttle at zero', () => {
    const { input, flight } = setup();
    arm(input, flight);
    input.keyboard.setThrottle(0.6);
    fly(flight, 1);
    input.keyboard.keyDown('KeyR');
    const e = flight.frame(1 / 60);
    input.keyboard.keyUp('KeyR');
    expect(e.respawned).toBe(true);
    expect(flight.drone.armed).toBe(false);
    expect(input.sticks.throttle).toBe(0);
    fly(flight, 0.2);
    expect(flight.altitude).toBeLessThan(0.01);
  });

  it('reports the camera key as an event', () => {
    const { input, flight } = setup();
    input.keyboard.keyDown('KeyC');
    expect(flight.frame(1 / 60).cameraToggle).toBe(true);
  });
});
