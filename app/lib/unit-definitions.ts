export const unitCategories = {
  length: { label: "长度", units: [["m", "米"], ["cm", "厘米"], ["mm", "毫米"], ["km", "千米"], ["um", "微米"], ["in", "英寸"], ["ft", "英尺"], ["yd", "码"], ["mi", "英里"]] },
  area: { label: "面积", units: [["m^2", "平方米"], ["cm^2", "平方厘米"], ["km^2", "平方千米"], ["hectare", "公顷"], ["acre", "英亩"], ["ft^2", "平方英尺"]] },
  volume: { label: "体积", units: [["L", "升"], ["mL", "毫升"], ["m^3", "立方米"], ["cm^3", "立方厘米"], ["ft^3", "立方英尺"]] },
  mass: { label: "质量", units: [["kg", "千克"], ["g", "克"], ["mg", "毫克"], ["tonne", "吨"], ["lb", "磅"], ["oz", "盎司"]] },
  temperature: { label: "温度", units: [["degC", "摄氏度"], ["degF", "华氏度"], ["K", "开尔文"]] },
  speed: { label: "速度", units: [["m/s", "米/秒"], ["km/h", "千米/小时"], ["mi/h", "英里/小时"], ["knots", "节"]] },
  pressure: { label: "压力", units: [["Pa", "帕斯卡"], ["kPa", "千帕"], ["MPa", "兆帕"], ["bar", "巴"], ["atm", "标准大气压"], ["mmHg", "毫米汞柱"], ["psi", "磅/平方英寸"]] },
  energy: { label: "能量", units: [["J", "焦耳"], ["kJ", "千焦"], ["cal", "卡路里"], ["kcal", "千卡"], ["Wh", "瓦时"], ["kWh", "千瓦时"]] },
  power: { label: "功率", units: [["W", "瓦"], ["kW", "千瓦"], ["MW", "兆瓦"], ["hp", "英制马力"]] },
  time: { label: "时间", units: [["s", "秒"], ["ms", "毫秒"], ["min", "分钟"], ["h", "小时"], ["day", "天"], ["week", "周"]] },
  data: { label: "数据容量", units: [["bit", "比特"], ["B", "字节"], ["kB", "KB（十进制）"], ["MB", "MB（十进制）"], ["GB", "GB（十进制）"], ["TB", "TB（十进制）"], ["KiB", "KiB（二进制）"], ["MiB", "MiB（二进制）"], ["GiB", "GiB（二进制）"], ["TiB", "TiB（二进制）"]] },
} as const;
export type UnitCategory = keyof typeof unitCategories;
