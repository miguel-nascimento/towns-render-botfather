export const getService = async (serviceId: string) => {
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  const json = (await response.json()) as {
    serviceDetails: { url: string };
  };
  return json;
};

export const updateEnv = async (
  serviceId: string,
  env: Record<string, string>
) => {
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}/env-vars`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        Object.entries(env).map(([key, value]) => ({
          key,
          value,
        }))
      ),
    }
  );
  return response.json();
};

export const triggerDeploy = async (serviceId: string) => {
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}/deploys`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.json() as Promise<{ id: string }>;
};

export const waitForDeploy = async (
  serviceId: string,
  deployId: string,
  onStatusChange: (status: CheckDeployResponse["status"]) => Promise<void>
) => {
  let response = await checkDeploy(serviceId, deployId);
  let lastStatus = response.status;
  while (response.status !== "live" && !isFailedDeploy(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    response = await checkDeploy(serviceId, deployId);
    if (response.status !== lastStatus) {
      await onStatusChange(response.status);
      lastStatus = response.status;
    }
  }
};

export const isFailedDeploy = (status: CheckDeployResponse["status"]) => {
  return (
    status === "deactivated" ||
    status === "build_failed" ||
    status === "update_failed" ||
    status === "canceled" ||
    status === "pre_deploy_failed"
  );
};
export const isDeployInProgress = (status: CheckDeployResponse["status"]) => {
  return (
    status === "created" ||
    status === "queued" ||
    status === "build_in_progress" ||
    status === "update_in_progress" ||
    status === "pre_deploy_in_progress"
  );
};
export const isDeployCompleted = (status: CheckDeployResponse["status"]) => {
  return status === "live";
};

type CheckDeployResponse = {
  status:
    | "created"
    | "queued"
    | "build_in_progress"
    | "update_in_progress"
    | "live"
    | "deactivated"
    | "build_failed"
    | "update_failed"
    | "canceled"
    | "pre_deploy_in_progress"
    | "pre_deploy_failed";
};

const checkDeploy = async (serviceId: string, deployId: string) => {
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}/deploys/${deployId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.json() as Promise<CheckDeployResponse>;
};
