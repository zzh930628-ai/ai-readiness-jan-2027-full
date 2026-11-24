const successSubmissionId = document.getElementById("successSubmissionId");
const successEmail = document.getElementById("successEmail");
const successAmountPaid = document.getElementById("successAmountPaid");
const successStatus = document.getElementById("successStatus");

function applySuccessData(data) {
  successSubmissionId.textContent = data.submissionId || "-";
  successEmail.textContent = data.email || "-";
  if (successAmountPaid && data.amountPaid) {
    successAmountPaid.textContent = data.amountPaid;
  }
  if (successStatus && data.status) {
    const statusMap = {
      payment_confirmed: "Payment Confirmed"
    };
    successStatus.textContent = statusMap[data.status] || data.status || "Payment Confirmed";
  }
}

function getStoredSuccessData() {
  try {
    const raw = window.sessionStorage.getItem("registrationSuccess");
    return raw ? JSON.parse(raw) : {};
  } catch (_error) {
    return {};
  }
}

try {
  const params = new URLSearchParams(window.location.search);
  const storedData = getStoredSuccessData();
  const dataFromQuery = {
    submissionId: params.get("submissionId") || "",
    email: params.get("email") || "",
    fullName: params.get("fullName") || "",
    status: params.get("status") || "",
    amountPaid: params.get("amountPaid") || ""
  };

  if (dataFromQuery.submissionId || dataFromQuery.email || dataFromQuery.fullName) {
    window.sessionStorage.setItem("registrationSuccess", JSON.stringify(dataFromQuery));
    applySuccessData(dataFromQuery);
  } else {
    applySuccessData(storedData);
  }
} catch (_error) {
  successSubmissionId.textContent = "-";
  successEmail.textContent = "-";
  if (successAmountPaid) successAmountPaid.textContent = "SGD 2,750.00";
  if (successStatus) successStatus.textContent = "Payment Confirmed";
}
