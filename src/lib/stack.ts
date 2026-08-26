// What actually runs this site, per environment.
//
// There are two deployments of this same codebase and they do NOT run on the
// same platform, so the footer colophon cannot name a single stack:
//
//   beta.pablocabrera.dev  → self-hosted k3s, Mongo in-cluster, MinIO for uploads
//   pablocabrera.dev       → AWS: EC2 behind Terraform, S3 for uploads, Mongo Atlas
//
// Which list renders is decided by PUBLIC_DEPLOY_ENV at RUNTIME, read through
// $env/dynamic/public rather than $env/static/public. That distinction matters
// here: CI builds one image and the same image is rolled to both deployments,
// so a build-time constant would bake one environment's stack into the other's
// pod. A dynamic read lets the same image tell the truth in both places.

import { env } from '$env/dynamic/public';

export type Tech = {
	label: string;
	/** Key into $lib/brand.ts. Null when the mark has no brand colour of its own. */
	brand: string;
	/** A mark in static/icons/. */
	src: string;
};

export type DeployEnv = 'development' | 'production';

/**
 * The application layer, which is the same wherever it is deployed — it is the
 * platform underneath that differs.
 */
const APP: Tech[] = [
	{ label: 'SvelteKit', brand: 'SVELTE', src: '/icons/svelte.svg' },
	{ label: 'TypeScript', brand: 'TYPESCRIPT', src: '/icons/typescript.svg' },
	{ label: 'Node', brand: 'NODE.JS', src: '/icons/nodedotjs.svg' }
];

/** Shipped last, so the pipeline reads as the tail of both lists. */
const PIPELINE: Tech[] = [
	{ label: 'GitHub Actions', brand: 'GITHUB ACTIONS', src: '/icons/githubactions.svg' },
	{ label: 'Linux', brand: 'LINUX', src: '/icons/linux.svg' }
];

/** beta.pablocabrera.dev — the self-hosted cluster. */
export const DEVELOPMENT_STACK: Tech[] = [
	...APP,
	{ label: 'MongoDB', brand: 'MONGODB', src: '/icons/mongodb.svg' },
	{ label: 'Docker', brand: 'DOCKER', src: '/icons/docker.svg' },
	{ label: 'k3s', brand: 'K3S', src: '/icons/k3s.svg' },
	...PIPELINE
];

/** pablocabrera.dev — the AWS target. */
export const PRODUCTION_STACK: Tech[] = [
	...APP,
	{ label: 'MongoDB Atlas', brand: 'MONGODB ATLAS', src: '/icons/mongodb.svg' },
	{ label: 'Docker', brand: 'DOCKER', src: '/icons/docker.svg' },
	{ label: 'Terraform', brand: 'TERRAFORM', src: '/icons/terraform.svg' },
	{ label: 'AWS', brand: 'AWS', src: '/icons/aws.svg' },
	{ label: 'Amazon EC2', brand: 'AMAZON EC2', src: '/icons/amazonec2.svg' },
	{ label: 'Amazon S3', brand: 'AMAZON S3', src: '/icons/amazons3.svg' },
	...PIPELINE
];

/**
 * Normalise whatever PUBLIC_DEPLOY_ENV happens to hold.
 *
 * Defaults to 'development' on anything unrecognised — including unset, which
 * is the case for `npm run dev` and for any pod that has not been given the
 * variable. Defaulting the other way would have an un-migrated deployment
 * claim an AWS stack it is not running on.
 */
export function resolveDeployEnv(raw: string | undefined): DeployEnv {
	return raw?.trim().toLowerCase() === 'production' ? 'production' : 'development';
}

export function stackFor(deployEnv: DeployEnv): Tech[] {
	return deployEnv === 'production' ? PRODUCTION_STACK : DEVELOPMENT_STACK;
}

/** The stack for the environment this process is actually running in. */
export function currentStack(): Tech[] {
	return stackFor(resolveDeployEnv(env.PUBLIC_DEPLOY_ENV));
}
