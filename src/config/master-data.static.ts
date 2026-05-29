/** Static master fields — matches legacy PHP master data API. */
export const MASTER_DATA_STATIC = {
  upiid: ["thesocialglue@ybl", "thesocialglue@yesbank"],
  account_detail: {
    "Account Detail": "The Social Glue",
    "Account Number": "0066102000046251",
    "IFSC Code": "IBKL0000066",
    "Bank Name": "IDBI Bank",
  },
  assistance: {
    email: "support@hellochotu.in",
    phone: "+91-92664 89666, +91 92663 85666",
  },
  rm_list: ["Pratik Singh Bhatia", "Dharmesh Verma", "Ankit Kumar"],
  location: [
    "Jamshedpur",
    "Patna",
    "Gaya",
    "Jehanabad",
    "Nagaon",
    "Guwahati",
    "Agartala",
    "Ghaziabad",
    "Delhi NCR",
    "Gurgaon",
    "Haryana",
    "Ranchi",
    "Kolkata",
    "Bangalore",
    "Udaipur,Tripura",
    "Rajkot",
  ],
  upi_img: {
    img: "https://admin.hellochotu.com/images/upi.jpg",
  },
} as const;
