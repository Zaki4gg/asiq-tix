export const ASIQTIX_TICKETS_ABI = [
  //owner/admin
  'function owner() view returns (address)',
  'function feeRecipient() view returns (address)',

  // view
  'function events(uint256 id) view returns (address promoter,uint256 tokenId,uint256 priceWei,uint256 maxSupply,uint256 sold,bool active,uint64 eventTime,string metadataURI)',
  'function isPromoter(address account) view returns (bool)',
  'function nextEventId() view returns (uint256)',
  'function promoterBalances(uint256 eventId) view returns (uint256)',
  'function feeBalances(uint256 eventId) view returns (uint256)',

  // main actions
  'function createEvent(uint256 priceWei,uint256 maxSupply,uint64 eventTime,string metadataURI) external returns (uint256)',
  'function updateEvent(uint256 eventId,uint256 newPriceWei,uint256 additionalSupply,bool active,uint64 newEventTime,string newMetadataURI) external',
  'function buyTicket(uint256 eventId,uint256 quantity) external payable',

  // admin/promoter
  'function setPromoter(address account,bool active) external',
  'function withdrawPromoter(uint256 eventId) external',
  'function withdrawFees(uint256 eventId) external',

  // events
  'event EventCreated(uint256 indexed eventId,address indexed promoter,uint256 tokenId,uint256 priceWei,uint256 maxSupply,uint64 eventTime,string metadataURI)',
  'event TicketPurchased(uint256 indexed eventId,address indexed buyer,uint256 quantity,uint256 totalPaidWei,uint256 feeWei,uint256 promoterShareWei)',
  'event PromoterWithdraw(uint256 indexed eventId,address indexed promoter,uint256 amount)',
  'event FeeWithdraw(uint256 indexed eventId,address indexed admin,uint256 amount)'
]


// // src/abi/asiqtixTicketsSimpleV3.ts
// export const ASIQTIX_TICKETS_ABI = [
//   // view
//   'function events(uint256 id) view returns (address promoter,uint256 tokenId,uint256 priceWei,uint256 maxSupply,uint256 sold,bool active,uint64 eventTime,string metadataURI)',
//   'function isPromoter(address account) view returns (bool)',

//   // actions
//   'function createEvent(uint256 priceWei,uint256 maxSupply,uint64 eventTime,string metadataURI) external returns (uint256)',
//   'function buyTicket(uint256 eventId,uint256 quantity) external payable',
//   'function withdrawPromoter(uint256 eventId) external',
//   'function withdrawFees(uint256 eventId) external',
//   'function setPromoter(address account,bool active) external',

//   // events
//   'event EventCreated(uint256 indexed eventId,address indexed promoter,uint256 tokenId,uint256 priceWei,uint256 maxSupply,uint64 eventTime,string metadataURI)',
// ]
