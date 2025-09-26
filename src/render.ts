export const getService = async (serviceId: string) => {
  const response = await fetch(
    `https://api.render.com/v1/services/${serviceId}`,
    {
      method: "GET",
    }
  );
  const json = (await response.json()) as {
    service: { serviceDetails: { url: string } };
  };
  return json.service;
};

export const updateEnv = async (
  projectId: string,
  env: Record<string, string>
) => {
  const response = await fetch(
    `https://api.render.com/v1/projects/${projectId}/env`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RENDER_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(env),
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

const isFailedDeploy = (status: CheckDeployResponse["status"]) => {
  return (
    status === "deactivated" ||
    status === "build_failed" ||
    status === "update_failed" ||
    status === "canceled" ||
    status === "pre_deploy_failed"
  );
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
    }
  );
  return response.json() as Promise<CheckDeployResponse>;
};
